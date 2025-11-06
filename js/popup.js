/**
 * AI Chat Memory - 侧边栏脚本
 * 负责侧边栏的UI逻辑和数据展示
 */

function canUseRuntimeAPI() {
  return typeof chrome !== 'undefined' &&
    !!chrome.runtime &&
    (!!chrome.runtime.id || typeof chrome.runtime.sendMessage === 'function');
}

class PopupManager {
  constructor() {
    this.conversations = [];
    this.filteredConversations = [];
    this.selectedConversations = new Set();
    this.currentSort = 'date'; // 'date', 'platform', 'title'
    this.currentFilter = 'all'; // 'all', 'today', 'week'

    this.init();
  }

  async init() {
    console.log('AI Chat Memory: 初始化侧边栏');

    // 绑定事件
    this.bindEvents();

    // 加载数据
    await this.loadData();

    // 渲染界面
    this.render();
  }

  bindEvents() {
    // 搜索功能
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', this.debounce(() => {
      this.handleSearch(searchInput.value);
    }, 300));

    // 导出按钮
    document.getElementById('exportAllBtn').addEventListener('click', () => {
      this.exportAllConversations();
    });

    document.getElementById('exportSelectedBtn').addEventListener('click', () => {
      this.exportSelectedConversations();
    });

    // 设置按钮（可选）
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        this.openSettings();
      });
    }

    // 监听存储变化，实时刷新
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.onChanged.addListener((changes) => {
        if (changes['sidebar_refresh_trigger']) {
          console.log('AI Chat Memory: 检测到刷新触发器');
          this.loadData();
        }
      });
    }

    this.updateExportButtonState();
  }

  async loadData() {
    try {
      console.log('AI Chat Memory: 开始加载数据');
      // 显示加载状态
      this.showLoading(true);

      // 并行加载数据
      const [conversations, usage] = await Promise.all([
        this.getAllConversations(),
        this.getStorageUsage()
      ]);

      console.log('AI Chat Memory: 数据加载完成，会话数量:', conversations ? conversations.length : 0);
      this.conversations = conversations || [];
      this.filteredConversations = [...this.conversations];

      // 清理已失效的选中状态
      const validIds = new Set(this.conversations.map(conv => conv.conversationId));
      Array.from(this.selectedConversations).forEach(id => {
        if (!validIds.has(id)) {
          this.selectedConversations.delete(id);
        }
      });

      // 更新统计信息
      this.updateStats(usage);

      // 渲染对话列表
      console.log('AI Chat Memory: 调用 render 方法');
      this.render();

    } catch (error) {
      console.error('AI Chat Memory: 加载数据失败', error);
      this.showLoading(false);
      this.showError('加载数据失败，请刷新重试');
    }
  }

  async getAllConversations() {
    return new Promise((resolve, reject) => {
      if (canUseRuntimeAPI()) {
        console.log('AI Chat Memory: 通过 Chrome extension API 获取所有会话');
        chrome.runtime.sendMessage({ type: 'getAllConversations' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('AI Chat Memory: 获取会话失败:', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
          } else {
            console.log('AI Chat Memory: 成功获取会话，数量:', response.conversations ? response.conversations.length : 0);
            resolve(response.conversations);
          }
        });
      } else {
        // 回退到本地存储（如果没有扩展上下文）
        console.warn('AI Chat Memory: 扩展上下文不可用，尝试使用本地存储');
        if (typeof StorageManager !== 'undefined') {
          const storageManager = new StorageManager();
          storageManager.initDB().then(() => {
            return storageManager.getAllConversations();
          }).then(conversations => {
            console.log('AI Chat Memory: 通过本地存储获取会话，数量:', conversations.length);
            resolve(conversations);
          }).catch(error => {
            reject(error);
          });
        } else {
          console.warn('AI Chat Memory: StorageManager 不可用');
          resolve([]);
        }
      }
    });
  }

  async getStorageUsage() {
    return new Promise((resolve, reject) => {
      if (canUseRuntimeAPI()) {
        chrome.runtime.sendMessage({ type: 'getStorageUsage' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response.usage);
          }
        });
      } else {
        // 回退到本地存储
        if (typeof StorageManager !== 'undefined') {
          const storageManager = new StorageManager();
          storageManager.initDB().then(() => {
            return storageManager.getAllConversations();
          }).then(conversations => {
            const totalConversations = conversations.length;
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayISOString = today.toISOString();

            const todayNewConversations = conversations.filter(conv =>
              conv.createdAt && conv.createdAt >= todayISOString
            ).length;

            resolve({ totalConversations, todayNewConversations });
          }).catch(error => {
            reject(error);
          });
        } else {
          resolve({ totalConversations: 0, todayNewConversations: 0 });
        }
      }
    });
  }

  updateStats(usage) {
    const totalElement = document.getElementById('totalConversations');
    const todayElement = document.getElementById('todayConversations');

    if (totalElement && usage) {
      totalElement.textContent = usage.totalConversations || 0;
    }

    if (todayElement && usage) {
      todayElement.textContent = usage.todayNewConversations || 0;
    }
  }

  render() {
    console.log('AI Chat Memory: 开始渲染对话列表，过滤后数量:', this.filteredConversations.length);
    const listContainer = document.getElementById('conversationList');

    if (this.filteredConversations.length === 0) {
      console.log('AI Chat Memory: 显示空状态');
      listContainer.innerHTML = this.getEmptyState();
      this.updateExportButtonState();
      return;
    }

    console.log('AI Chat Memory: 渲染对话列表');
    listContainer.innerHTML = this.filteredConversations
      .map(conversation => this.renderConversationItem(conversation))
      .join('');

    // 绑定项目事件
    this.bindItemEvents();
    console.log('AI Chat Memory: 对话列表渲染完成');
    this.updateExportButtonState();
  }

  renderConversationItem(conversation) {
    const isSelected = this.selectedConversations.has(conversation.conversationId);
    const platformName = this.getPlatformDisplayName(conversation.platform);
    const formattedDate = this.formatDate(conversation.updatedAt || conversation.createdAt);
    const messageCount = conversation.messages ? conversation.messages.length : 0;
    const selectedClass = isSelected ? ' selected' : '';
    const checkedAttr = isSelected ? ' checked' : '';

    return `
      <div class="conversation-item${selectedClass}" data-id="${conversation.conversationId}">
        <label class="conversation-select" title="选择此对话">
          <input type="checkbox" class="conversation-checkbox"${checkedAttr} aria-label="选择对话 ${this.escapeHtml(conversation.title || '未命名对话')}" />
          <span class="conversation-checkmark"></span>
        </label>
        <div class="conversation-content">
          <div class="conversation-title">
            <span class="title-text">${this.escapeHtml(conversation.title || '未命名对话')}</span>
            <span class="conversation-platform">${platformName}</span>
          </div>
          <div class="conversation-meta">
            <span class="conversation-messages">${messageCount} 条消息</span>
            <span class="conversation-date">${formattedDate}</span>
          </div>
        </div>
      </div>
    `;
  }

  getEmptyState() {
    return `
      <div class="empty-state">
        <div class="empty-icon">📝</div>
        <div class="empty-title">暂无对话记录</div>
        <div class="empty-description">
          在支持的AI聊天网站中，对话会自动保存到这里
        </div>
      </div>
    `;
  }

  showLoading(show) {
    const listContainer = document.getElementById('conversationList');
    if (show) {
      listContainer.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
        </div>
      `;
    }
  }

  showError(message) {
    const listContainer = document.getElementById('conversationList');
    listContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⚠️</div>
        <div class="empty-title">出错了</div>
        <div class="empty-description">${this.escapeHtml(message)}</div>
      </div>
    `;
  }

  bindItemEvents() {
    const items = document.querySelectorAll('.conversation-item');
    items.forEach(item => {
      if (!item || !item.dataset) return;
      const conversationId = item.dataset.id;

      // 点击事件：可以选择或查看详情
      item.addEventListener('click', (e) => {
        this.handleItemClick(conversationId, e);
      });

      // 右键菜单：显示更多操作
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        this.showContextMenu(e, item.dataset.id);
      });

      const checkbox = item.querySelector('.conversation-checkbox');
      if (checkbox) {
        checkbox.addEventListener('click', (e) => {
          e.stopPropagation();
        });
        checkbox.addEventListener('change', (e) => {
          this.toggleSelection(conversationId, e.target.checked);
        });
      }

      const selectLabel = item.querySelector('.conversation-select');
      if (selectLabel) {
        selectLabel.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    });
  }

  handleItemClick(conversationId, event) {
    if (event.ctrlKey || event.metaKey) {
      // 多选模式
      this.toggleSelection(conversationId);
    } else {
      // 单选模式：显示对话详情
      this.showConversationDetail(conversationId);
    }
  }

  toggleSelection(conversationId, forceSelected = null) {
    const currentlySelected = this.selectedConversations.has(conversationId);
    const shouldSelect = forceSelected === null ? !currentlySelected : forceSelected;

    if (shouldSelect) {
      this.selectedConversations.add(conversationId);
    } else {
      this.selectedConversations.delete(conversationId);
    }

    // 更新UI
    const item = document.querySelector(`[data-id="${conversationId}"]`);
    if (item) {
      item.classList.toggle('selected', shouldSelect);
      const checkbox = item.querySelector('.conversation-checkbox');
      if (checkbox) {
        checkbox.checked = shouldSelect;
      }
    }

    // 更新按钮状态
    this.updateExportButtonState();
  }

  handleSearch(query) {
    if (!query.trim()) {
      this.filteredConversations = [...this.conversations];
    } else {
      const lowerQuery = query.toLowerCase();
      this.filteredConversations = this.conversations.filter(conversation => {
        return (conversation.title && conversation.title.toLowerCase().includes(lowerQuery)) ||
               (conversation.platform && conversation.platform.toLowerCase().includes(lowerQuery)) ||
               (conversation.messages && conversation.messages.some(msg =>
                 msg.content && msg.content.toLowerCase().includes(lowerQuery)
               ));
      });
    }

    this.render();
  }

  showConversationDetail(conversationId) {
    const conversation = this.conversations.find(c => c.conversationId === conversationId);
    if (!conversation) return;

    // 创建详情模态框
    const modal = document.createElement('div');
    modal.className = 'conversation-detail-modal';
    modal.innerHTML = this.generateDetailModalHTML(conversation);

    // 添加到页面
    document.body.appendChild(modal);

    // 绑定关闭事件
    const closeBtn = modal.querySelector('.detail-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideConversationDetail();
      });
    }

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideConversationDetail();
      }
    });

    // 添加打开原链接的按钮事件
    const openLinkBtn = modal.querySelector('.open-link-btn');
    if (openLinkBtn) {
      openLinkBtn.addEventListener('click', () => {
        if (conversation.link) {
          // 创建新标签页打开链接
          window.open(conversation.link, '_blank');
        }
      });
    }

    // 添加导出按钮事件
    const exportBtn = modal.querySelector('.export-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportSingleConversation(conversationId);
      });
    }
  }

  hideConversationDetail() {
    const modal = document.querySelector('.conversation-detail-modal');
    if (modal) {
      modal.remove();
    }
  }

  generateDetailModalHTML(conversation) {
    const platformName = this.getPlatformDisplayName(conversation.platform);
    const createdDate = new Date(conversation.createdAt).toLocaleString();
    const updatedDate = new Date(conversation.updatedAt).toLocaleString();
    const messageCount = conversation.messages ? conversation.messages.length : 0;

    return `
      <div class="detail-modal-backdrop">
        <div class="detail-modal-content">
          <div class="detail-header">
            <h3 class="detail-title">${this.escapeHtml(conversation.title || '未命名对话')}</h3>
            <button class="detail-close-btn" title="关闭">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.41 5L5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41 17.59 5 12 10.59z"/>
              </svg>
            </button>
          </div>

          <div class="detail-meta">
            <div class="meta-item">
              <span class="meta-label">平台:</span>
              <span class="meta-value">${platformName}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">创建时间:</span>
              <span class="meta-value">${createdDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">更新时间:</span>
              <span class="meta-value">${updatedDate}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">消息数量:</span>
              <span class="meta-value">${messageCount}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">链接:</span>
              <button class="open-link-btn" title="在原网站打开">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
                  <path d="M5 5h5V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5h-2v5H5V5z"/>
                </svg>
                <span class="link-text">${this.escapeHtml(conversation.link || '无链接')}</span>
              </button>
            </div>
          </div>

          <div class="detail-messages">
            <h4 class="messages-title">对话内容</h4>
            <div class="messages-container">
              ${conversation.messages && conversation.messages.length > 0 ?
                conversation.messages.map(msg => this.generateMessageHTML(msg)).join('') :
                '<div class="empty-messages">暂无消息内容</div>'
              }
            </div>
          </div>

          <div class="detail-actions">
            <button class="action-btn export-btn" title="导出此对话">
              导出
            </button>
          </div>
        </div>
      </div>
    `;
  }

  generateMessageHTML(message) {
    const sender = message.sender === 'user' ? '用户' : 'AI';
    const senderClass = message.sender === 'user' ? 'user-message' : 'ai-message';
    const time = new Date(message.createdAt).toLocaleString();

    return `
      <div class="message-item ${senderClass}">
        <div class="message-header">
          <span class="message-sender">${sender}</span>
          <span class="message-time">${time}</span>
        </div>
        <div class="message-content">
          ${message.thinking ? `<div class="message-thinking"><strong>思考过程:</strong> ${this.escapeHtml(message.thinking)}</div>` : ''}
          <div class="message-text">${this.escapeHtml(message.content)}</div>
        </div>
      </div>
    `;
  }

  showContextMenu(event, conversationId) {
    // 简单的右键菜单实现
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${event.clientY}px;
      left: ${event.clientX}px;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      padding: 4px 0;
      min-width: 150px;
    `;

    const menuItems = [
      { label: '复制链接', action: () => this.copyLink(conversationId) },
      { label: '删除对话', action: () => this.deleteConversation(conversationId) }
    ];

    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.label;
      menuItem.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        color: #374151;
      `;
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#f3f4f6';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      menuItem.addEventListener('click', item.action);
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    const closeMenu = (e) => {
      if (menu && menu.parentNode && !menu.contains(e.target)) {
        document.body.removeChild(menu);
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => {
      document.addEventListener('click', closeMenu);
    }, 100);
  }

  async copyLink(conversationId) {
    const conversation = this.conversations.find(c => c.conversationId === conversationId);
    if (conversation && conversation.link) {
      try {
        await navigator.clipboard.writeText(conversation.link);
        this.showNotification('链接已复制到剪贴板', 'success');
      } catch (error) {
        console.error('复制失败:', error);
        this.showNotification('复制失败', 'error');
      }
    }
  }

  async deleteConversation(conversationId) {
    if (!confirm('确定要删除这个对话吗？此操作不可撤销。')) {
      return;
    }

    try {
      if (canUseRuntimeAPI()) {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            type: 'deleteConversation',
            conversationId
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });

        // 从本地数组中移除
        this.conversations = this.conversations.filter(c => c.conversationId !== conversationId);
        this.filteredConversations = this.filteredConversations.filter(c => c.conversationId !== conversationId);
        this.selectedConversations.delete(conversationId);

        // 重新渲染
        this.render();
        this.showNotification('对话已删除', 'success');

      } else {
        throw new Error('Chrome Runtime API不可用');
      }
    } catch (error) {
      console.error('删除对话失败:', error);
      this.showNotification('删除失败', 'error');
    }
  }

  async exportAllConversations() {
    try {
      if (this.conversations.length === 0) {
        this.showNotification('没有可导出的对话', 'warning');
        return;
      }

      const conversationIds = this.conversations.map(c => c.conversationId);
      await this.exportConversations(conversationIds, '全部对话');
    } catch (error) {
      console.error('导出全部对话失败:', error);
      this.showNotification('导出失败', 'error');
    }
  }

  async exportSelectedConversations() {
    try {
      if (this.selectedConversations.size === 0) {
        this.showNotification('请先选择要导出的对话', 'warning');
        return;
      }

      const conversationIds = Array.from(this.selectedConversations);
      await this.exportConversations(conversationIds, '选中对话');
    } catch (error) {
      console.error('导出选中对话失败:', error);
      this.showNotification('导出失败', 'error');
    }
  }

  async exportConversations(conversationIds, description) {
    if (conversationIds.length === 0) {
      this.showNotification('没有可导出的对话', 'warning');
      return;
    }

    // 简单的导出实现：导出为文本文件
    const selectedConversations = this.conversations.filter(c =>
      conversationIds.includes(c.conversationId)
    );

    const exportContent = this.generateExportContent(selectedConversations);
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const filename = `ai-chat-memory_${description}_${timestamp}.txt`;

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    if (downloadLink.parentNode) {
      document.body.removeChild(downloadLink);
    }

    URL.revokeObjectURL(url);
    this.showNotification(`成功导出 ${conversationIds.length} 个对话`, 'success');
  }

  generateExportContent(conversations) {
    let content = `# AI Chat Memory 导出文件\n`;
    content += `导出时间: ${new Date().toLocaleString()}\n`;
    content += `对话数量: ${conversations.length}\n\n`;

    conversations.forEach((conversation, index) => {
      content += `## 对话 ${index + 1}: ${this.escapeHtml(conversation.title || '未命名')}\n`;
      content += `平台: ${this.getPlatformDisplayName(conversation.platform)}\n`;
      content += `链接: ${conversation.link}\n`;
      content += `创建时间: ${new Date(conversation.createdAt).toLocaleString()}\n`;
      content += `更新时间: ${new Date(conversation.updatedAt).toLocaleString()}\n`;

      if (conversation.messages && conversation.messages.length > 0) {
        content += `--- 对话内容 ---\n`;
        conversation.messages.forEach(message => {
          const sender = message.sender === 'user' ? '用户' : 'AI';
          content += `\n**${sender}** [${new Date(message.createdAt).toLocaleString()}]:\n`;
          if (message.thinking) {
            content += `*思考过程*: ${message.thinking}\n`;
          }
          content += `${message.content}\n`;
        });
      }

      content += `\n${'='.repeat(50)}\n\n`;
    });

    return content;
  }

  exportSingleConversation(conversationId) {
    const conversation = this.conversations.find(c => c.conversationId === conversationId);
    if (!conversation) {
      this.showNotification('找不到要导出的对话', 'error');
      return;
    }

    const exportContent = this.generateExportContent([conversation], '单个对话');
    const blob = new Blob([exportContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
    const title = conversation.title || '未命名对话';
    const safeTitle = title.replace(/[^\w\u4e00-\u9fa5]/g, '_');
    const filename = `ai-chat-memory_${safeTitle}_${timestamp}.txt`;

    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.download = filename;
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
    if (downloadLink.parentNode) {
      document.body.removeChild(downloadLink);
    }

    URL.revokeObjectURL(url);
    this.showNotification(`成功导出对话: ${title}`, 'success');
  }

  showNotification(message, type = 'info') {
    // 简单的通知实现
    const notification = document.createElement('div');
    notification.className = 'notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10001;
      font-size: 14px;
      font-weight: 500;
      max-width: 300px;
      word-wrap: break-word;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 自动消失
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  getPlatformDisplayName(platform) {
    const platformNames = {
      'chatgpt': 'ChatGPT',
      'gemini': 'Gemini',
      'monica': 'Monica'
    };
    return platformNames[platform] || platform;
  }

  formatDate(dateString) {
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now - date;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60));

      if (diffDays === 0) {
        return '今天';
      } else if (diffDays === 1) {
        return '昨天';
      } else if (diffDays < 7) {
        return `${diffDays}天前`;
      } else {
        return date.toLocaleDateString();
      }
    } catch (error) {
      return '未知时间';
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  updateExportButtonState() {
    const btn = document.getElementById('exportSelectedBtn');
    if (btn) {
      btn.disabled = this.selectedConversations.size === 0;
      btn.textContent = this.selectedConversations.size > 0 ?
        `导出选中 (${this.selectedConversations.size})` :
        '导出选中';
    }
  }

  openSettings() {
    // TODO: 实现设置页面
    this.showNotification('设置功能开发中', 'info');
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
