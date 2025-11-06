/**
 * AI Chat Memory 后台脚本
 * 作为扩展的核心部分，负责数据库操作和消息处理
 */

// 时间处理工具函数（与 compatibility.js 中的 TimeUtils.getMessageTime 保持一致）
function getMessageTime(message) {
  if (!message) return '';

  if (message.createdAt) return message.createdAt;
  if (message.timestamp) return message.timestamp;

  return new Date().toISOString();
}

// 初始化设置
const defaultSettings = {
  autoSave: true // 默认开启自动保存
};

// 平台名称映射（全局统一管理）
const PLATFORM_NAMES = {
  'chatgpt': 'ChatGPT',
  'gemini': 'Gemini',
  'monica': 'Monica'
};

// 扩展安装或更新时
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      // 首次安装时初始化设置
      chrome.storage.sync.set({ settings: defaultSettings }, () => {
        console.log('AI Chat Memory: 初始化设置完成');
      });

      // 首次安装时打开欢迎页面（可选）
      // chrome.tabs.create({
      //   url: 'html/welcome.html'
      // });
    }
  });
}

// 监听来自内容脚本和弹出窗口的消息
if (typeof chrome !== 'undefined' && chrome.runtime) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // 根据消息类型分发处理
    switch (message.type) {
      case 'connectDB':
        // 数据库连接请求（实际上IndexedDB在content script中初始化）
        sendResponse({ status: 'ok' });
        break;

      case 'findConversationByUrl':
        findConversationByUrl(message.url)
          .then(conversation => {
            sendResponse({ conversation });
          })
          .catch(error => {
            console.error('查询会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true; // 保持消息通道开放，等待异步响应

      case 'createConversation':
        createConversation(message.conversation)
          .then(conversationId => {
            sendResponse({ conversationId });
            // 通知侧边栏刷新
            notifySidebarRefresh();
          })
          .catch(error => {
            console.error('创建会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'updateConversation':
        updateConversation(message.conversation)
          .then(() => {
            sendResponse({ status: 'ok' });
            // 通知侧边栏刷新
            notifySidebarRefresh();
          })
          .catch(error => {
            console.error('更新会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'getConversationById':
        getConversationById(message.conversationId)
          .then(conversation => {
            sendResponse({ conversation });
          })
          .catch(error => {
            console.error('获取会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'getAllConversations':
        getAllConversations()
          .then(conversations => {
            sendResponse({ conversations });
          })
          .catch(error => {
            console.error('获取所有会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'deleteConversation':
        deleteConversation(message.conversationId)
          .then(() => {
            sendResponse({ status: 'ok' });
            // 通知侧边栏刷新
            notifySidebarRefresh();
          })
          .catch(error => {
            console.error('删除会话失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'getStorageUsage':
        getStorageUsage()
          .then(usage => {
            sendResponse({ usage });
          })
          .catch(error => {
            console.error('获取存储使用情况失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'updateSettings':
        updateSettings(message.settings)
          .then(() => {
            // 通知所有内容脚本设置已更新
            notifySettingsUpdated(message.settings);
            sendResponse({ status: 'ok' });
          })
          .catch(error => {
            console.error('更新设置失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'getSettings':
        getSettings()
          .then(settings => {
            sendResponse({ settings });
          })
          .catch(error => {
            console.error('获取设置失败:', error);
            sendResponse({ error: error.toString() });
          });
        return true;

      case 'openSidePanel':
        // 处理来自内容脚本的侧边栏打开请求
        if (sender.tab && sender.tab.id) {
          if (chrome.sidePanel) {
            chrome.sidePanel.open({ tabId: sender.tab.id })
              .then(() => {
                sendResponse({ status: 'ok' });
              })
              .catch(error => {
                console.error('打开侧边栏失败:', error);
                sendResponse({ error: error.toString() });
              });
          } else {
            sendResponse({ error: 'Side Panel API不可用' });
          }
        } else {
          sendResponse({ error: '无法获取当前标签页信息' });
        }
        return true;
    }

    return false;
  });

  // 监听扩展图标点击事件，打开侧边栏
  if (chrome.action) {
    chrome.action.onClicked.addListener((tab) => {
      if (chrome.sidePanel) {
        chrome.sidePanel.open({ tabId: tab.id });
      }
    });
  }
}

// 数据库对象和相关函数
const DB_NAME = 'AIChatMemoryDB';
const DB_VERSION = 1;
const CONVERSATION_STORE = 'conversations';

// 打开数据库连接
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(CONVERSATION_STORE)) {
        const conversationStore = db.createObjectStore(CONVERSATION_STORE, { keyPath: 'conversationId' });
        conversationStore.createIndex('link', 'link', { unique: false });
        conversationStore.createIndex('platform', 'platform', { unique: false });
        conversationStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        conversationStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 根据URL查找会话
async function findConversationByUrl(url) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readonly');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const index = store.index('link');
    const request = index.get(url);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 创建新会话
async function createConversation(conversation) {
  const db = await openDB();

  // 生成唯一ID
  conversation.conversationId = conversation.conversationId || generateId();

  // 设置时间戳
  const now = new Date().toISOString();
  conversation.createdAt = conversation.createdAt || now;
  conversation.updatedAt = now;

  // 初始化消息数组
  if (!conversation.messages) {
    conversation.messages = [];
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readwrite');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const request = store.add(conversation);

    request.onsuccess = () => {
      resolve(conversation.conversationId);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 更新会话
async function updateConversation(conversation) {
  const db = await openDB();

  // 更新时间戳
  conversation.updatedAt = new Date().toISOString();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readwrite');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const request = store.put(conversation);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 获取会话
async function getConversationById(conversationId) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readonly');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const request = store.get(conversationId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 获取对话的排序时间（与显示逻辑保持一致）
function getConversationSortTime(conversation) {
  if (!conversation) return new Date().toISOString();

  // 优先使用最后一条消息的时间
  if (conversation.messages && conversation.messages.length > 0) {
    const lastMessage = conversation.messages[conversation.messages.length - 1];
    if (lastMessage.updatedAt) return lastMessage.updatedAt;
    if (lastMessage.createdAt) return lastMessage.createdAt;
    if (lastMessage.timestamp) return lastMessage.timestamp;
  }

  // 如果没有消息，使用对话本身的时间
  if (conversation.lastMessageAt) return conversation.lastMessageAt;
  if (conversation.createdAt) return conversation.createdAt;
  if (conversation.timestamp) return conversation.timestamp;

  // 最后降级处理
  return new Date().toISOString();
}

// 获取所有会话
async function getAllConversations() {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readonly');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      // 按最后消息时间倒序排序（与显示逻辑保持一致）
      const conversations = request.result || [];
      conversations.sort((a, b) => {
        return new Date(getConversationSortTime(b)) - new Date(getConversationSortTime(a));
      });
      resolve(conversations);
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 删除会话
async function deleteConversation(conversationId) {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readwrite');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const request = store.delete(conversationId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// 获取存储使用情况
async function getStorageUsage() {
  const db = await openDB();

  return new Promise((resolve) => {
    const transaction = db.transaction([CONVERSATION_STORE], 'readonly');
    const store = transaction.objectStore(CONVERSATION_STORE);
    const countRequest = store.count();

    countRequest.onsuccess = () => {
      const totalConversations = countRequest.result;

      // 获取今日新增会话
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayISOString = today.toISOString();

      const index = store.index('createdAt');
      const range = IDBKeyRange.lowerBound(todayISOString);
      const todayRequest = index.count(range);

      todayRequest.onsuccess = () => {
        const todayCount = todayRequest.result;

        resolve({
          totalConversations,
          todayNewConversations: todayCount
        });
      };
    };
  });
}

// 更新设置
async function updateSettings(settings) {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ settings }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } else {
      reject('Chrome Storage API不可用');
    }
  });
}

// 获取设置
async function getSettings() {
  return new Promise((resolve, reject) => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get(['settings'], (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result.settings || defaultSettings);
        }
      });
    } else {
      resolve(defaultSettings);
    }
  });
}

// 通知所有内容脚本设置已更新
function notifySettingsUpdated(settings) {
  if (typeof chrome !== 'undefined' && chrome.tabs) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        // 过滤出支持的AI Chat页面
        if (tab.url && (
          tab.url.includes('chatgpt.com') ||
          tab.url.includes('chat.openai.com') ||
          tab.url.includes('gemini.google.com') ||
          tab.url.includes('monica.im') ||
          tab.url.includes('app.monica.im')
        )) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'settingsUpdated',
            settings
          }).catch(() => {
            // 忽略无法发送消息的错误
            // 这可能是因为内容脚本尚未加载
          });
        }
      });
    });
  }
}

// 通知侧边栏刷新
function notifySidebarRefresh() {
  // 使用storage change事件来通知刷新
  // 这是一个简单的触发机制
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.set({
      'sidebar_refresh_trigger': Date.now()
    });
  }
}

// 格式化日期时间为 yyyy-MM-DD hh:mm:ss 格式
function formatDateTimeForDisplay(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return 'Invalid Date';
  }

  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  const hours = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  const seconds = ('0' + date.getSeconds()).slice(-2);

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

// 格式化日期时间为 yyyyMMDDhhmmss 格式，用于文件名
function formatDateForFilename(date) {
  if (!(date instanceof Date) || isNaN(date)) {
    return 'InvalidDate';
  }

  const year = date.getFullYear();
  const month = ('0' + (date.getMonth() + 1)).slice(-2);
  const day = ('0' + date.getDate()).slice(-2);
  const hours = ('0' + date.getHours()).slice(-2);
  const minutes = ('0' + date.getMinutes()).slice(-2);
  const seconds = ('0' + date.getSeconds()).slice(-2);

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// 生成唯一ID
function generateId() {
  return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}