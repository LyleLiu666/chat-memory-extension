/**
 * AI Chat Memory 通用内容处理脚本
 * 负责创建悬浮标签、处理保存状态显示和通用功能
 */

// 悬浮标签DOM元素
let floatTag = null;
let iconElement = null;

// 初始化状态标记，防止重复初始化
let isInitialized = false;

// 全局设置对象
window.aiChatMemorySettings = {
  autoSave: true // 默认开启自动保存
};

const FLOAT_ICON_SIZE = '28px';

// 判断扩展运行时是否可用（runtime.id 某些情况下会暂时不可用）
function canUseRuntimeAPI() {
  return typeof chrome !== 'undefined' &&
    !!chrome.runtime &&
    (!!chrome.runtime.id || typeof chrome.runtime.sendMessage === 'function');
}

// 初始化函数
function initCommon() {
  // 防止重复初始化
  if (isInitialized) {
    console.log('AI Chat Memory: 已初始化，跳过重复初始化');
    return;
  }

  console.log('AI Chat Memory: 初始化通用功能');
  isInitialized = true;

  // 检查扩展上下文有效性
  if (!canUseRuntimeAPI()) {
    console.warn('AI Chat Memory: 扩展上下文不可用，可能是在重载或导航期间');
    return;
  }

  // 安全地从存储中获取设置
  try {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['settings'], (result) => {
        if (chrome.runtime.lastError) {
          console.error('AI Chat Memory: 获取设置失败:', chrome.runtime.lastError);
        } else if (result && result.settings) {
          // 直接更新全局设置对象
          window.aiChatMemorySettings = Object.assign({}, window.aiChatMemorySettings, result.settings);
        }

        // 创建悬浮标签（确保在有效上下文中）
        if (canUseRuntimeAPI()) {
          createFloatTag();
        }
      });
    } else {
      console.warn('AI Chat Memory: Chrome Storage API不可用');
    }
  } catch (error) {
    console.error('AI Chat Memory: 获取设置失败:', error);
    // 出错时仍然尝试创建悬浮标签，使用默认设置
    if (canUseRuntimeAPI()) {
      createFloatTag();
    }
  }

  // 监听来自后台脚本的消息
  try {
    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'settingsUpdated' && message.settings) {
          // 更新全局设置
          window.aiChatMemorySettings = Object.assign({}, window.aiChatMemorySettings, message.settings);
          updateFloatTagState();
        }
        sendResponse({status: 'ok'});
        return true;
      });
    }
  } catch (error) {
    console.error('AI Chat Memory: 设置消息监听器失败:', error);
  }
}

// 清理页面上可能存在的重复悬浮标签
function cleanupExistingFloatTags() {
  // 查找所有可能的悬浮标签元素
  const existingTags = document.querySelectorAll('.ai-chat-memory-float, [data-ai-chat-memory-tag="true"]');

  existingTags.forEach(tag => {
    if (tag && tag.parentNode) {
      console.log('AI Chat Memory: 清理重复的悬浮标签');
      tag.parentNode.removeChild(tag);
    }
  });

  // 清理边缘引导元素
  const existingGuides = document.querySelectorAll('.edge-guide, [data-ai-chat-memory-guide="true"]');
  existingGuides.forEach(guide => {
    if (guide && guide.parentNode) {
      console.log('AI Chat Memory: 清理边缘引导元素');
      guide.parentNode.removeChild(guide);
    }
  });

  // 重置全局变量
  floatTag = null;
  iconElement = null;
}

// 保存悬浮标签位置到本地存储（基于边缘距离）
function saveFloatTagPosition(x, y, isEdgeDocked = false, dockedSide = null) {
  try {
    // 计算与各边缘的距离
    const distanceFromLeft = x;
    const distanceFromTop = y;
    const distanceFromRight = window.innerWidth - x;
    const distanceFromBottom = window.innerHeight - y;

    // 判断标签更靠近哪个边缘，选择最小距离的边作为参考
    let anchor, distance;

    if (distanceFromLeft <= distanceFromRight) {
      // 靠近左边
      anchor = 'left';
      distance = distanceFromLeft;
    } else {
      // 靠近右边
      anchor = 'right';
      distance = distanceFromRight;
    }

    // 垂直方向也采用相同逻辑
    let verticalAnchor, verticalDistance;
    if (distanceFromTop <= distanceFromBottom) {
      verticalAnchor = 'top';
      verticalDistance = distanceFromTop;
    } else {
      verticalAnchor = 'bottom';
      verticalDistance = distanceFromBottom;
    }

    const positionData = {
      anchor,
      distance: Math.max(0, distance),
      verticalAnchor,
      verticalDistance: Math.max(0, verticalDistance),
      isEdgeDocked,
      dockedSide
    };

    localStorage.setItem('ai-chat-memory-float-position', JSON.stringify(positionData));
  } catch (error) {
    console.error('保存悬浮标签位置失败:', error);
  }
}

// 从本地存储恢复悬浮标签位置（基于边缘距离）
function restoreFloatTagPosition() {
  try {
    const savedPosition = localStorage.getItem('ai-chat-memory-float-position');
    if (savedPosition) {
      const position = JSON.parse(savedPosition);

      // 兼容旧版本的绝对像素位置数据
      if (position.x !== undefined && position.y !== undefined) {
        // 旧版本数据，转换为边缘距离格式并保存
        const distanceFromLeft = position.x;
        const distanceFromRight = window.innerWidth - position.x;
        const distanceFromTop = position.y;
        const distanceFromBottom = window.innerHeight - position.y;

        const newPosition = {
          anchor: distanceFromLeft <= distanceFromRight ? 'left' : 'right',
          distance: Math.min(distanceFromLeft, distanceFromRight),
          verticalAnchor: distanceFromTop <= distanceFromBottom ? 'top' : 'bottom',
          verticalDistance: Math.min(distanceFromTop, distanceFromBottom)
        };

        // 更新存储为新格式
        localStorage.setItem('ai-chat-memory-float-position', JSON.stringify(newPosition));
        return newPosition;
      }

      // 兼容百分比版本数据
      if (position.percentX !== undefined && position.percentY !== undefined) {
        // 百分比数据，转换为边缘距离格式
        const x = (position.percentX / 100) * window.innerWidth;
        const y = (position.percentY / 100) * window.innerHeight;

        const distanceFromLeft = x;
        const distanceFromRight = window.innerWidth - x;
        const distanceFromTop = y;
        const distanceFromBottom = window.innerHeight - y;

        const newPosition = {
          anchor: distanceFromLeft <= distanceFromRight ? 'left' : 'right',
          distance: Math.min(distanceFromLeft, distanceFromRight),
          verticalAnchor: distanceFromTop <= distanceFromBottom ? 'top' : 'bottom',
          verticalDistance: Math.min(distanceFromTop, distanceFromBottom)
        };

        // 更新存储为新格式
        localStorage.setItem('ai-chat-memory-float-position', JSON.stringify(newPosition));
        return newPosition;
      }

      // 新版本边缘距离数据
      if (position.anchor !== undefined && position.distance !== undefined) {
        return position;
      }
    }
  } catch (error) {
    console.error('恢复悬浮标签位置失败:', error);
  }
  return null;
}

// 创建悬浮标签
function createFloatTag() {
  // 清理可能存在的旧标签
  cleanupExistingFloatTags();

  // 创建悬浮标签元素
  floatTag = document.createElement('div');
  floatTag.className = 'ai-chat-memory-float ai-chat-memory-fade-in';
  floatTag.setAttribute('data-ai-chat-memory-tag', 'true');

  // 创建图标元素
  iconElement = document.createElement('div');
  iconElement.className = 'ai-chat-memory-icon';
  iconElement.innerHTML = createLogoHTML(FLOAT_ICON_SIZE);

  // 拖动相关变量
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let initialX = 0;
  let initialY = 0;
  let clickStartTime = 0;

  // 贴边相关变量
  let leftEdgeGuide = null;
  let rightEdgeGuide = null;
  let isEdgeDocked = false;
  let dockedSide = null; // 'left' 或 'right'

  // 贴边检测阈值（像素）
  const EDGE_THRESHOLD = 50;

  // 创建边缘引导元素
  function createEdgeGuides() {
    // 左边引导
    leftEdgeGuide = document.createElement('div');
    leftEdgeGuide.className = 'edge-guide left';
    leftEdgeGuide.setAttribute('data-ai-chat-memory-guide', 'true');
    document.body.appendChild(leftEdgeGuide);

    // 右边引导
    rightEdgeGuide = document.createElement('div');
    rightEdgeGuide.className = 'edge-guide right';
    rightEdgeGuide.setAttribute('data-ai-chat-memory-guide', 'true');
    document.body.appendChild(rightEdgeGuide);
  }

  // 显示边缘引导
  function showEdgeGuide(side) {
    if (side === 'left' && leftEdgeGuide) {
      leftEdgeGuide.classList.add('active');
      rightEdgeGuide.classList.remove('active');
    } else if (side === 'right' && rightEdgeGuide) {
      rightEdgeGuide.classList.add('active');
      leftEdgeGuide.classList.remove('active');
    }
  }

  // 隐藏边缘引导
  function hideEdgeGuides() {
    if (leftEdgeGuide) leftEdgeGuide.classList.remove('active');
    if (rightEdgeGuide) rightEdgeGuide.classList.remove('active');
  }

  // 清理边缘引导元素
  function cleanupEdgeGuides() {
    if (leftEdgeGuide) {
      leftEdgeGuide.remove();
      leftEdgeGuide = null;
    }
    if (rightEdgeGuide) {
      rightEdgeGuide.remove();
      rightEdgeGuide = null;
    }
  }

  // 创建边缘引导元素
  createEdgeGuides();

  // 为悬浮标签添加拖动功能
  floatTag.addEventListener('mousedown', function(e) {
    clickStartTime = Date.now();
    isDragging = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const rect = floatTag.getBoundingClientRect();
    initialX = rect.left;
    initialY = rect.top;

    // 添加拖动样式
    floatTag.style.cursor = 'grabbing';
    floatTag.style.userSelect = 'none';

    // 阻止默认行为
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (clickStartTime === 0) return;

    const deltaX = e.clientX - dragStartX;
    const deltaY = e.clientY - dragStartY;

    // 如果移动距离超过5px，则认为是拖动
    if (!isDragging && (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5)) {
      isDragging = true;
      floatTag.classList.add('dragging');
      // 如果当前是贴边状态，先退出贴边模式
      if (isEdgeDocked) {
        floatTag.classList.remove('edge-docked', 'left', 'right');
        isEdgeDocked = false;
        dockedSide = null;
      }
    }

    if (isDragging) {
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;

      // 限制在视窗范围内
      const maxX = window.innerWidth - floatTag.offsetWidth;
      const maxY = window.innerHeight - floatTag.offsetHeight;

      const constrainedX = Math.max(0, Math.min(newX, maxX));
      const constrainedY = Math.max(0, Math.min(newY, maxY));

      floatTag.style.left = constrainedX + 'px';
      floatTag.style.top = constrainedY + 'px';
      floatTag.style.right = 'auto';

      // 边缘检测和视觉引导
      const distanceFromLeft = constrainedX;
      const distanceFromRight = window.innerWidth - constrainedX - floatTag.offsetWidth;

      // 移除之前的边缘样式
      floatTag.classList.remove('near-edge');

      if (distanceFromLeft <= EDGE_THRESHOLD) {
        // 接近左边缘
        showEdgeGuide('left');
        floatTag.classList.add('near-edge');
      } else if (distanceFromRight <= EDGE_THRESHOLD) {
        // 接近右边缘
        showEdgeGuide('right');
        floatTag.classList.add('near-edge');
      } else {
        // 远离边缘
        hideEdgeGuides();
      }
    }
  });

  document.addEventListener('mouseup', function(e) {
    if (clickStartTime === 0) return;

    const clickDuration = Date.now() - clickStartTime;

    // 恢复样式
    floatTag.classList.remove('dragging');
    floatTag.style.cursor = 'grab';
    floatTag.style.userSelect = 'auto';

    // 如果是点击（不是拖动且时间短）
    if (!isDragging && clickDuration < 300) {
      const isManualMode = !(window.aiChatMemorySettings && window.aiChatMemorySettings.autoSave);
      const forceOpenPanel = e.metaKey || e.ctrlKey;

      if (isManualMode && !forceOpenPanel) {
        handleManualSave();
      } else {
        // 检查扩展上下文是否有效
        if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
          console.log('AI Chat Memory: 扩展上下文已失效，请刷新页面');
          return;
        }

        // 触发打开侧边栏或管理面板
        try {
          if (typeof chrome !== 'undefined' && chrome.runtime) {
            chrome.runtime.sendMessage({
              type: 'openSidePanel'
            }, function(response) {
              if (chrome.runtime.lastError) {
                console.error('打开侧边栏失败:', chrome.runtime.lastError);
              } else {
                console.log('AI Chat Memory: 侧边栏打开请求已发送');
              }
            });
          }
        } catch (error) {
          console.error('发送消息失败:', error);
        }
      }
    }

    // 如果进行了拖动，检查是否需要贴边
    if (isDragging) {
      const rect = floatTag.getBoundingClientRect();
      const distanceFromLeft = rect.left;
      const distanceFromRight = window.innerWidth - rect.left - rect.width;

      // 检查是否需要贴边
      if (distanceFromLeft <= EDGE_THRESHOLD) {
        // 贴左边
        floatTag.classList.add('edge-docked', 'left');
        floatTag.style.left = '0px';
        floatTag.style.right = 'auto';
        isEdgeDocked = true;
        dockedSide = 'left';
        // 保存贴边状态
        saveFloatTagPosition(0, rect.top, true, 'left');
      } else if (distanceFromRight <= EDGE_THRESHOLD) {
        // 贴右边
        floatTag.classList.add('edge-docked');
        floatTag.classList.remove('left');
        floatTag.style.right = '0px';
        floatTag.style.left = 'auto';
        isEdgeDocked = true;
        dockedSide = 'right';
        // 保存贴边状态
        saveFloatTagPosition(window.innerWidth - rect.width, rect.top, true, 'right');
      } else {
        // 普通位置，保存新位置
        saveFloatTagPosition(rect.left, rect.top, false);
      }

      // 清理样式
      floatTag.classList.remove('near-edge');
      hideEdgeGuides();
    }

    // 重置拖动状态
    isDragging = false;
    clickStartTime = 0;
  });

  // 添加鼠标悬停效果，提示用户可以点击或拖动
  floatTag.style.cursor = 'grab';
  floatTag.title = '点击打开记忆管理器，拖动调整位置';

  // 恢复之前保存的位置
  const savedPosition = restoreFloatTagPosition();
  if (savedPosition && savedPosition.anchor !== undefined && savedPosition.distance !== undefined) {
    // 根据边缘距离计算实际像素位置
    let targetX, targetY;

    // 水平位置计算
    if (savedPosition.anchor === 'left') {
      targetX = savedPosition.distance;
    } else { // right
      targetX = window.innerWidth - savedPosition.distance;
    }

    // 垂直位置计算
    if (savedPosition.verticalAnchor === 'top') {
      targetY = savedPosition.verticalDistance;
    } else { // bottom
      targetY = window.innerHeight - savedPosition.verticalDistance;
    }

    // 确保位置在当前视窗范围内（考虑标签尺寸）
    const rect = floatTag.getBoundingClientRect();
    const tagWidth = rect.width || 48;
    const tagHeight = rect.height || 48;
    const maxX = window.innerWidth - tagWidth;
    const maxY = window.innerHeight - tagHeight;

    const constrainedX = Math.max(0, Math.min(targetX, maxX));
    const constrainedY = Math.max(0, Math.min(targetY, maxY));

    floatTag.style.left = constrainedX + 'px';
    floatTag.style.top = constrainedY + 'px';
    floatTag.style.right = 'auto';

    // 恢复贴边状态（如果有）
    if (savedPosition.isEdgeDocked) {
      isEdgeDocked = true;
      dockedSide = savedPosition.dockedSide;
      floatTag.classList.add('edge-docked');
      if (dockedSide === 'left') {
        floatTag.classList.add('left');
        floatTag.style.left = '0px';
        floatTag.style.right = 'auto';
      } else {
        floatTag.style.right = '0px';
        floatTag.style.left = 'auto';
      }
    }
  }

  // 添加元素到悬浮标签
  floatTag.appendChild(iconElement);

  // 添加到页面
  document.body.appendChild(floatTag);

  // 根据设置显示不同状态
  updateFloatTagState();

  // 监听窗口大小变化，重新调整悬浮标签位置
  let resizeTimeout;
  window.addEventListener('resize', function() {
    // 使用防抖避免频繁调整
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(function() {
      repositionFloatTag();
    }, 100);
  });
}

// 重新定位悬浮标签（基于保存的边缘距离）
function repositionFloatTag() {
  if (!floatTag) return;

  const savedPosition = restoreFloatTagPosition();
  if (savedPosition && savedPosition.anchor !== undefined && savedPosition.distance !== undefined) {
    // 检查是否处于贴边状态
    if (savedPosition.isEdgeDocked && savedPosition.dockedSide) {
      // 恢复贴边状态
      floatTag.classList.add('edge-docked');
      if (savedPosition.dockedSide === 'left') {
        floatTag.classList.add('left');
        floatTag.style.left = '0px';
        floatTag.style.right = 'auto';
      } else { // right
        floatTag.classList.remove('left');
        floatTag.style.right = '0px';
        floatTag.style.left = 'auto';
      }

      // 垂直位置计算
      let targetY;
      if (savedPosition.verticalAnchor === 'top') {
        targetY = savedPosition.verticalDistance;
      } else { // bottom
        targetY = window.innerHeight - savedPosition.verticalDistance;
      }

      // 确保垂直位置在当前视窗范围内
      const rect = floatTag.getBoundingClientRect();
      const tagHeight = rect.height || 48;
      const maxY = window.innerHeight - tagHeight;
      const constrainedY = Math.max(0, Math.min(targetY, maxY));

      floatTag.style.top = constrainedY + 'px';
      return; // 贴边状态已处理，不需要继续执行
    }

    // 非贴边状态的常规定位
    let targetX, targetY;

    // 水平位置计算
    if (savedPosition.anchor === 'left') {
      targetX = savedPosition.distance;
    } else { // right
      targetX = window.innerWidth - savedPosition.distance;
    }

    // 垂直位置计算
    if (savedPosition.verticalAnchor === 'top') {
      targetY = savedPosition.verticalDistance;
    } else { // bottom
      targetY = window.innerHeight - savedPosition.verticalDistance;
    }

    // 确保位置在当前视窗范围内
    const rect = floatTag.getBoundingClientRect();
    const tagWidth = rect.width || 48;
    const tagHeight = rect.height || 48;
    const maxX = window.innerWidth - tagWidth;
    const maxY = window.innerHeight - tagHeight;

    const constrainedX = Math.max(0, Math.min(targetX, maxX));
    const constrainedY = Math.max(0, Math.min(targetY, maxY));

    floatTag.style.left = constrainedX + 'px';
    floatTag.style.top = constrainedY + 'px';
    floatTag.style.right = 'auto';
  }
}

// 生成logo HTML的辅助函数
function createLogoHTML(size = FLOAT_ICON_SIZE) {
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return `<img src="${chrome.runtime.getURL('icons/logo.svg')}" alt="AI Chat Memory Logo" style="width: ${size}; height: ${size}; display: block; object-fit: contain; object-position: center;">`;
  } else {
    return `<div style="width: ${size}; height: ${size}; background: #4090FF; border-radius: 2px; display: flex; align-items: center; justify-content: center; color: white; font-size: 10px; font-weight: bold;">AI</div>`;
  }
}

function createGlyphIconHTML(char, color, size = FLOAT_ICON_SIZE) {
  const numericSize = parseInt(size, 10) || 24;
  const fontSize = Math.max(12, numericSize - 6);
  return `<span style="width: ${size}; height: ${size}; display: flex; align-items: center; justify-content: center; font-size: ${fontSize}px; color: ${color}; font-weight: bold;">${char}</span>`;
}

function createCheckIconHTML(size = FLOAT_ICON_SIZE) {
  return createGlyphIconHTML('✓', '#16a34a', size);
}

function createErrorIconHTML(size = FLOAT_ICON_SIZE) {
  return createGlyphIconHTML('✕', '#dc2626', size);
}

// 设置悬浮标签状态（统一状态管理函数）
function setFloatTagState(state, text, icon) {
  if (!floatTag || !iconElement) return;

  floatTag.title = text || 'AI Chat Memory';

  // 保存贴边状态
  const isEdgeDockedState = floatTag.classList.contains('edge-docked');
  const isLeftDocked = floatTag.classList.contains('left');

  // 移除所有状态类，但保留贴边状态
  floatTag.className = 'ai-chat-memory-float';

  // 恢复贴边状态
  if (isEdgeDockedState) {
    floatTag.classList.add('edge-docked');
    if (isLeftDocked) {
      floatTag.classList.add('left');
    }
  }

  // 添加当前状态类
  floatTag.classList.add(`ai-chat-memory-${state}`);

  // 更新图标
  iconElement.innerHTML = icon;
}

// 更新悬浮标签状态
function updateFloatTagState() {
  if (!floatTag) return;

  const iconHTML = createLogoHTML(FLOAT_ICON_SIZE);
  if (window.aiChatMemorySettings.autoSave) {
    // 自动保存模式 - 使用logo
    setFloatTagState('auto-save', '自动记忆', iconHTML);
  } else {
    // 手动保存模式 - 使用logo
    setFloatTagState('manual-save', '手动保存', iconHTML);
  }
}

// 显示保存成功状态
function showSuccessStatus() {
  if (!floatTag) return;

  setFloatTagState('success', '保存成功', createCheckIconHTML());

  // 延迟恢复原来的状态
  setTimeout(() => {
    updateFloatTagState();
  }, 1500);
}

// 显示保存失败状态
function showErrorStatus() {
  if (!floatTag) return;

  setFloatTagState('error', '保存失败', createErrorIconHTML());

  // 延迟恢复原来的状态
  setTimeout(() => {
    updateFloatTagState();
  }, 3000);
}

// 处理手动保存
function handleManualSave() {
  // 触发页面内容捕获
  window.dispatchEvent(new CustomEvent('ai-chat-memory-manual-save'));

  showSuccessStatus();
}

// 导出通用函数和设置
window.aiChatMemoryCommon = {
  showSuccessStatus,
  showErrorStatus,
  cleanupFloatTags: cleanupExistingFloatTags // 导出清理函数
};

// 导出设置更新方法
window.aiChatMemory = {
  ...(window.aiChatMemory || {}),
  updateSettings: function(newSettings) {
    window.aiChatMemorySettings = Object.assign({}, window.aiChatMemorySettings, newSettings);
    updateFloatTagState();
  },
  // 重置初始化状态的方法（用于调试或特殊情况）
  resetInitialization: function() {
    isInitialized = false;
    cleanupExistingFloatTags();
    // 清理边缘引导元素
    if (typeof cleanupEdgeGuides === 'function') {
      cleanupEdgeGuides();
    }
  }
};

// 统一初始化入口点，防止重复初始化
function safeInit() {
  // 如果已经初始化，直接返回
  if (isInitialized) {
    console.log('AI Chat Memory: 已初始化，跳过重复初始化');
    return;
  }

  // 由于使用"document_end"，DOM已经完全加载，但需要确保扩展上下文有效
  if (canUseRuntimeAPI()) {
    console.log('AI Chat Memory: 扩展上下文有效，开始初始化');
    initCommon();
  } else {
    // 如果扩展上下文暂时无效，等待一下再试
    setTimeout(() => {
      if (canUseRuntimeAPI()) {
        console.log('AI Chat Memory: 扩展上下文恢复，开始初始化');
        initCommon();
      } else {
        console.warn('AI Chat Memory: 扩展上下文仍然无效，跳过初始化');
      }
    }, 500);
  }
}

// 由于使用"document_end"，直接调用初始化
safeInit();
