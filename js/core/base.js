/**
 * AI Chat Memory - 平台适配器基类
 * 抽取所有平台的公共逻辑，各平台只需实现特定的抽象方法
 */

class BasePlatformAdapter {
  constructor(platform) {
    this.platform = platform;

    this.pageUrl = window.location.href;
    this.currentConversationId = null;
    this.savedMessageIds = new Set();
    this.lastCheckTime = 0;
    this.isChecking = false;
    this.contentObserver = null;

    this.CHECK_INTERVAL = 2000;
    this.currentMessagesMap = new Map();
    this.debounceTimer = null;
    this.DEBOUNCE_DELAY = 1000;
    this.lastMessagesJson = null;

    this.lastKnownUrl = '';
    this.lastKnownConversationId = null;
    this.urlCheckInterval = null;

    this.isCreatingConversation = false;
    this.creationPromise = null;
    this.currentUrlKey = null;

    this.compatibility = null;
    this.storageManager = null;

    // 当扩展上下文无效或用户环境不允许时，强制使用本地存储
    this.forceLocalStorageMode = false;

    this.initializeComponents();
  }

  initializeComponents() {
    if (typeof Compatibility !== 'undefined') {
      this.compatibility = new Compatibility();
    }

    if (typeof StorageManager !== 'undefined') {
      this.storageManager = new StorageManager();
    }

    console.log('AI Chat Memory: 组件初始化完成', {
      hasCompatibility: !!this.compatibility,
      hasStorageManager: !!this.storageManager
    });

    // 全局错误防护（避免未捕获的 Extension context invalidated）
    this.setupGlobalErrorGuards();
  }

  /**
   * 设置全局错误处理，拦截扩展上下文失效导致的未捕获 Promise 拒绝
   */
  setupGlobalErrorGuards() {
    try {
      if (typeof window === 'undefined') return;
      if (window.__aiChatMemoryUnhandledGuardInstalled) return;
      window.__aiChatMemoryUnhandledGuardInstalled = true;

      window.addEventListener('unhandledrejection', (event) => {
        const reason = event && event.reason;
        const msg = String((reason && reason.message) || reason || '');
        if (/Extension context invalidated/i.test(msg)) {
          console.warn('AI Chat Memory: 捕获到扩展上下文失效，切换到本地存储模式');
          // 尽量避免后续再使用扩展 API
          try { this.forceLocalStorageMode = true; } catch (_) {}
          event.preventDefault();
        }
      });
    } catch (_) {
      // 忽略全局防护安装失败
    }
  }

  /**
   * 验证是否为有效的对话URL
   * @param {string} url - 要验证的URL
   * @returns {boolean} - 是否为有效的对话URL
   */
  isValidConversationUrl(url) {
    throw new Error('子类必须实现 isValidConversationUrl 方法');
  }

  /**
   * 从URL中提取对话信息
   * @param {string} url - 要分析的URL
   * @returns {Object} - 包含conversationId和isNewConversation的对象
   */
  extractConversationInfo(url) {
    throw new Error('子类必须实现 extractConversationInfo 方法');
  }

  /**
   * 提取页面上的所有消息
   * @returns {Array} - 消息数组
   */
  extractMessages() {
    throw new Error('子类必须实现 extractMessages 方法');
  }

  /**
   * 检查元素是否为消息元素
   * @param {Node} node - 要检查的DOM节点
   * @returns {boolean} - 是否为消息元素
   */
  isMessageElement(node) {
    throw new Error('子类必须实现 isMessageElement 方法');
  }

  /**
   * 从页面提取标题（可选实现）
   * @returns {string|null} - 提取的标题或null
   */
  extractTitle() {
    return null;
  }

  /**
   * 初始化适配器
   */
  init() {
    if (this.isValidConversationUrl(this.pageUrl)) {
      setTimeout(() => {
        this.initAdapter();
      }, 100);
    } else {
      console.log(`AI Chat Memory: 当前页面不是有效的${this.platform}对话页面`);
    }
  }

  /**
   * 初始化适配器核心逻辑
   * @param {Object} options - 初始化选项
   */
  initAdapter(options = {}) {
    if (this.contentObserver) {
      console.log('AI Chat Memory: 断开之前的内容观察器');
      this.contentObserver.disconnect();
      this.contentObserver = null;
    }

    this.pageUrl = options.url || window.location.href;
    const extractedConversationId = options.conversationId;
    const isNewConversation = options.isNewConversation;

    console.log(`AI Chat Memory: 初始化适配器 - URL: ${this.pageUrl}`);
    console.log(`AI Chat Memory: 对话ID: ${extractedConversationId || '未提取'}`);
    console.log(`AI Chat Memory: 是否新对话: ${isNewConversation || false}`);

    const cleanUrl = this.pageUrl.split('?')[0];
    const urlKey = `${this.platform}_${cleanUrl}`;
    if (this.currentUrlKey !== urlKey) {
      this.isCreatingConversation = false;
      this.creationPromise = null;
      this.currentUrlKey = urlKey;
    }

    this.connectToDatabase()
      .then(() => {
        if (window.aiChatMemorySettings && window.aiChatMemorySettings.autoSave) {
          return this.findOrCreateConversation();
        }
        return this.findConversation();
      })
      .then((conversationId) => {
        if (!conversationId) {
          console.log('AI Chat Memory: No conversation ID found or created. Halting initialization.');
          return Promise.reject('No conversation ID');
        }
        this.currentConversationId = conversationId;
        console.log('AI Chat Memory: 当前会话ID:', this.currentConversationId);

        if (window.aiChatMemorySettings && window.aiChatMemorySettings.autoSave) {
          console.log('AI Chat Memory: 自动保存模式 - 执行初始保存');
          return this.saveAllMessages();
        } else {
          console.log('AI Chat Memory: 手动保存模式 - 跳过初始保存');
          return Promise.resolve();
        }
      })
      .then((saveResult) => {
        if (!this.currentConversationId) return;

        if (window.aiChatMemorySettings && window.aiChatMemorySettings.autoSave) {
          console.log('AI Chat Memory: 自动保存模式 - 设置内容变化监听器');
          this.contentObserver = this.setupMutationObserver();
        } else {
          console.log('AI Chat Memory: 手动保存模式 - 不设置自动监听器');
        }
      })
      .catch(error => {
        if (error !== 'No conversation ID') {
          console.error('AI Chat Memory: Initialization failed:', error);
        }
      });
  }

  /**
   * 连接到数据库
   * @returns {Promise<void>}
   */
  async connectToDatabase(retryCount = 0) {
    return new Promise((resolve, reject) => {
      // 优先使用 Chrome extension API 进行数据存储
      if (typeof chrome !== 'undefined' && chrome.runtime) {
        const MAX_RUNTIME_ID_RETRY = 3;
        const RETRY_DELAY_BASE = 500; // ms

        try {
          if (typeof chrome.runtime.sendMessage !== 'function') {
            if (retryCount < MAX_RUNTIME_ID_RETRY) {
              const delay = Math.min(3000, RETRY_DELAY_BASE * (retryCount + 1));
              console.log(`AI Chat Memory: runtime.sendMessage 不可用，${delay}ms 后重试 (${retryCount + 1}/${MAX_RUNTIME_ID_RETRY})`);
              setTimeout(() => {
                this.connectToDatabase(retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              console.warn('AI Chat Memory: runtime.sendMessage 长时间不可用，回退到本地存储模式');
              this.fallbackToLocalStorage(resolve, reject);
            }
            return;
          }

          // 检查扩展ID；若缺失，视为上下文无效并有限次重试，否则回退到本地存储
          if (!chrome.runtime.id) {
            console.warn('AI Chat Memory: 扩展ID为空，视为扩展上下文无效');
            if (retryCount < MAX_RUNTIME_ID_RETRY) {
              const delay = Math.min(3000, RETRY_DELAY_BASE * (retryCount + 1));
              console.log(`AI Chat Memory: 扩展ID缺失，${delay}ms 后重试 (${retryCount + 1}/${MAX_RUNTIME_ID_RETRY})`);
              setTimeout(() => {
                this.connectToDatabase(retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, delay);
            } else {
              console.warn('AI Chat Memory: 扩展ID在多次重试后仍为空，回退到本地存储模式');
              this.fallbackToLocalStorage(resolve, reject);
            }
            return;
          }

          chrome.runtime.sendMessage({type: 'connectDB'}, (response) => {
            if (chrome.runtime.lastError) {
              console.error('AI Chat Memory: Chrome Runtime错误:', chrome.runtime.lastError);
              // 尝试重试
              if (retryCount < MAX_RUNTIME_ID_RETRY) {
                console.log(`AI Chat Memory: Runtime错误，重试 (${retryCount + 1}/${MAX_RUNTIME_ID_RETRY})`);
                setTimeout(() => {
                  this.connectToDatabase(retryCount + 1).then(resolve).catch(reject);
                }, Math.min(4000, 1000 * (retryCount + 1)));
              } else {
                this.fallbackToLocalStorage(resolve, reject);
              }
            } else if (response && response.status === 'ok') {
              console.log('AI Chat Memory: 数据库连接成功');
              resolve();
            } else {
              console.error('AI Chat Memory: 数据库连接失败', response?.error || '未知错误');
              reject('数据库连接失败');
            }
          });
        } catch (error) {
          console.warn('AI Chat Memory: 检查扩展上下文时出错:', error);
          if (retryCount < MAX_RUNTIME_ID_RETRY) {
            setTimeout(() => {
              this.connectToDatabase(retryCount + 1).then(resolve).catch(reject);
            }, Math.min(4000, 1000 * (retryCount + 1)));
          } else {
            this.fallbackToLocalStorage(resolve, reject);
          }
        }
      } else {
        console.warn('AI Chat Memory: 扩展上下文不可用，使用本地StorageManager');
        this.fallbackToLocalStorage(resolve, reject);
      }
    });
  }

  /**
   * 回退到本地存储
   * @param {Function} resolve - Promise resolve 函数
   * @param {Function} reject - Promise reject 函数
   */
  fallbackToLocalStorage(resolve, reject) {
    if (this.storageManager) {
      console.log('AI Chat Memory: 回退到本地StorageManager');
      this.forceLocalStorageMode = true;
      this.storageManager.initDB().then(resolve).catch(reject);
    } else {
      console.error('AI Chat Memory: StorageManager未初始化，无法回退');
      reject('StorageManager未初始化');
    }
  }

  /**
   * 检查是否可以使用扩展API
   * @returns {boolean}
   */
  canUseExtensionAPI() {
    if (this.forceLocalStorageMode) {
      return false;
    }

    if (typeof chrome === 'undefined' || !chrome.runtime) {
      return false;
    }
    try {
      // 仅当扩展ID真实存在且 sendMessage 可用时，才认为可用
      if (!chrome.runtime.id) return false;
      return typeof chrome.runtime.sendMessage === 'function';
    } catch (_) {
      return false;
    }
  }

  /**
   * 带重试的消息发送
   * @param {Object} message - 要发送的消息
   * @param {number} retryCount - 当前重试次数
   * @returns {Promise}
   */
  sendMessageWithRetry(message, retryCount = 0) {
    return new Promise((resolve, reject) => {
      if (!this.canUseExtensionAPI()) {
        reject('扩展API不可用');
        return;
      }

      try {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) {
            if (retryCount < 2) {
              console.log(`AI Chat Memory: 消息发送失败，重试 (${retryCount + 1}/3)`);
              setTimeout(() => {
                this.sendMessageWithRetry(message, retryCount + 1)
                  .then(resolve)
                  .catch(reject);
              }, 500 * (retryCount + 1));
            } else {
              // 如果扩展上下文失效，切换到本地模式
              if (/Extension context invalidated/i.test(chrome.runtime.lastError.message || '')) {
                this.forceLocalStorageMode = true;
              }
              reject('消息发送失败: ' + chrome.runtime.lastError.message);
            }
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        // 处理同步抛出的异常（如 Extension context invalidated）
        if (/Extension context invalidated/i.test(String(err && err.message))) {
          this.forceLocalStorageMode = true;
        }
        if (retryCount < 2) {
          setTimeout(() => {
            this.sendMessageWithRetry(message, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, 500 * (retryCount + 1));
        } else {
          reject(err);
        }
      }
    });
  }

  /**
   * 仅查找会话，不创建新会话
   * @returns {Promise<string|null>} 会话ID或null
   */
  async findConversation() {
    return new Promise((resolve, reject) => {
      const externalId = this.lastKnownConversationId;

      if (externalId && !externalId.startsWith('new_conversation_')) {
        console.log(`AI Chat Memory: 使用外部ID查询会话: ${externalId}`);
        this.findConversationByExternalId(externalId)
          .then(conversation => {
            if (conversation) {
              console.log(`AI Chat Memory: 通过外部ID找到会话: ${conversation.conversationId}`);
              resolve(conversation.conversationId);
              return;
            }
            this.fallbackToUrlSearch(resolve);
          })
          .catch(() => {
            this.fallbackToUrlSearch(resolve);
          });
      } else {
        this.fallbackToUrlSearch(resolve);
      }
    });
  }

  /**
   * 回退到URL查询的函数
   */
  fallbackToUrlSearch(resolve) {
    const cleanUrl = this.pageUrl.split('?')[0];
    console.log(`AI Chat Memory: 回退到URL查询: ${cleanUrl}`);

    // 优先使用 Chrome extension API
    if (this.canUseExtensionAPI()) {
      this.sendMessageWithRetry({type: 'findConversationByUrl', url: cleanUrl})
        .then(response => {
          if (response && response.conversation) {
            const extId = this.lastKnownConversationId;
            // 若存在外部ID且与已存记录外部ID不一致，视为不同会话，不复用
            if (extId && response.conversation.externalId && response.conversation.externalId !== extId) {
              console.log('AI Chat Memory: URL匹配到的会话外部ID不同，忽略此会话');
              resolve(null);
              return;
            }
            console.log(`AI Chat Memory: 通过URL找到会话: ${response.conversation.conversationId}`);
            resolve(response.conversation.conversationId);
          } else {
            console.log('AI Chat Memory: 未找到会话，不创建新会话');
            resolve(null);
          }
        })
        .catch(error => {
          console.warn('AI Chat Memory: URL查询失败，将回退或忽略:', error);
          resolve(null);
        });
    } else if (this.storageManager) {
      this.storageManager.findConversationByUrl(cleanUrl)
        .then(conversation => {
          if (conversation) {
            const extId = this.lastKnownConversationId;
            if (extId && conversation.externalId && conversation.externalId !== extId) {
              console.log('AI Chat Memory: URL匹配到的会话外部ID不同，忽略此会话');
              resolve(null);
              return;
            }
            console.log(`AI Chat Memory: 通过URL找到会话: ${conversation.conversationId}`);
            resolve(conversation.conversationId);
          } else {
            console.log('AI Chat Memory: 未找到会话，不创建新会话');
            resolve(null);
          }
        })
        .catch(error => {
          console.warn('AI Chat Memory: URL查询失败，将回退或忽略:', error);
          resolve(null);
        });
    } else {
      resolve(null);
    }
  }

  /**
   * 根据ID获取会话
   */
  async getConversationById(conversationId) {
    // 优先使用 Chrome extension API
    if (this.canUseExtensionAPI()) {
      try {
        const response = await this.sendMessageWithRetry({type: 'getConversationById', conversationId});
        return response ? (response.conversation || null) : null;
      } catch (error) {
          console.warn('AI Chat Memory: 获取会话失败，将回退到本地存储:', error);
          if (/Extension context invalidated/i.test(String(error && error.message))) {
            this.forceLocalStorageMode = true;
          }
          if (this.storageManager) {
            console.log('AI Chat Memory: 回退到本地存储获取会话');
            return await this.storageManager.getConversation(conversationId);
          }
          return null;
      }
    } else if (this.storageManager) {
      return await this.storageManager.getConversation(conversationId);
    }
    return null;
  }

  /**
   * 查找或创建会话
   * @returns {Promise<string|null>} 会话ID或null
   */
  async findOrCreateConversation() {
    // 生成当前URL的唯一键
    const cleanUrl = this.pageUrl.split('?')[0];
    const urlKey = `${this.platform}_${cleanUrl}`;

    // 如果正在为同一URL创建对话，返回现有的Promise
    if (this.isCreatingConversation && this.currentUrlKey === urlKey && this.creationPromise) {
      console.log(`AI Chat Memory: 正在为URL创建对话，等待现有操作完成: ${cleanUrl}`);
      return this.creationPromise;
    }

    // 如果URL发生变化，重置创建状态
    if (this.currentUrlKey !== urlKey) {
      this.isCreatingConversation = false;
      this.creationPromise = null;
      this.currentUrlKey = urlKey;
    }

    // 设置创建锁
    this.isCreatingConversation = true;
    this.currentUrlKey = urlKey;

    this.creationPromise = new Promise((resolve, reject) => {
      const attemptExtraction = (retryCount = 0) => {
        const messages = this.extractMessages();

        if (messages.length === 0 && retryCount < 3) {
          console.log(`AI Chat Memory: 页面暂无消息内容，${1000 * (retryCount + 1)}ms后重试 (${retryCount + 1}/3)`);
          setTimeout(() => attemptExtraction(retryCount + 1), 1000 * (retryCount + 1));
          return;
        }

        if (messages.length === 0) {
          console.log('AI Chat Memory: 页面无消息内容，不创建新对话');
          this.isCreatingConversation = false;
          this.creationPromise = null;
          resolve(null);
          return;
        }

        this.processConversation(messages, resolve, reject);
      };

      attemptExtraction();
    });

    // 处理Promise完成后的清理
    this.creationPromise.finally(() => {
      this.isCreatingConversation = false;
      this.creationPromise = null;
    });

    return this.creationPromise;
  }

  /**
   * 处理对话的核心逻辑
   */
  processConversation(messages, resolve, reject) {
    const externalId = this.lastKnownConversationId;
    const isNewConversation = externalId && externalId.startsWith('new_conversation_');

    if (externalId && !isNewConversation) {
      console.log(`AI Chat Memory: 使用外部ID查询会话: ${externalId}`);
      this.findConversationByExternalId(externalId)
        .then(conversation => {
          if (conversation) {
            console.log(`AI Chat Memory: 通过外部ID找到会话: ${conversation.conversationId}`);
            resolve(conversation.conversationId);
            return;
          }
          this.fallbackToUrlSearchForCreate(messages, resolve, reject);
        })
        .catch(() => {
          this.fallbackToUrlSearchForCreate(messages, resolve, reject);
        });
    } else {
      this.fallbackToUrlSearchForCreate(messages, resolve, reject);
    }
  }

  /**
   * 创建新会话的URL查询回退
   */
  fallbackToUrlSearchForCreate(messages, resolve, reject) {
    const cleanUrl = this.pageUrl.split('?')[0];
    console.log(`AI Chat Memory: 回退到URL查询: ${cleanUrl}`);

    // 优先使用 Chrome extension API
    if (this.canUseExtensionAPI()) {
      try {
        chrome.runtime.sendMessage({type: 'findConversationByUrl', url: cleanUrl}, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('AI Chat Memory: URL查询失败，将尝试双重检查:', chrome.runtime.lastError);
            this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
          } else if (response && response.conversation) {
            const extId = this.lastKnownConversationId;
            if (extId && response.conversation.externalId && response.conversation.externalId !== extId) {
              console.log('AI Chat Memory: URL匹配到的会话外部ID不同，将创建新会话');
              this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
              return;
            }
            console.log(`AI Chat Memory: 通过URL找到会话: ${response.conversation.conversationId}`);
            // 如有外部ID但记录缺失，补写外部ID，避免后续覆盖
            if (extId && !response.conversation.externalId) {
              try {
                response.conversation.externalId = extId;
                chrome.runtime.sendMessage({ type: 'updateConversation', conversation: response.conversation }, () => {});
              } catch (_) {}
            }
            resolve(response.conversation.conversationId);
          } else {
            // 在创建新对话前再次检查，防止竞争条件
            this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
          }
        });
      } catch (error) {
        console.warn('AI Chat Memory: URL查询调用异常，将尝试双重检查:', error);
        this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
      }
    } else if (this.storageManager) {
      this.storageManager.findConversationByUrl(cleanUrl)
        .then(conversation => {
          if (conversation) {
            const extId = this.lastKnownConversationId;
            if (extId && conversation.externalId && conversation.externalId !== extId) {
              console.log('AI Chat Memory: URL匹配到的会话外部ID不同，将创建新会话');
              this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
              return;
            }
            console.log(`AI Chat Memory: 通过URL找到会话: ${conversation.conversationId}`);
            if (extId && !conversation.externalId && this.storageManager && this.storageManager.updateConversation) {
              try {
                conversation.externalId = extId;
                this.storageManager.updateConversation(conversation);
              } catch (_) {}
            }
            resolve(conversation.conversationId);
          } else {
            // 在创建新对话前再次检查，防止竞争条件
            this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
          }
        })
        .catch(() => {
          this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
        });
    } else {
      this.doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject);
    }
  }

  /**
   * 创建前双重检查，防止竞争条件
   */
  doubleCheckBeforeCreate(messages, cleanUrl, resolve, reject) {
    console.log(`AI Chat Memory: 创建前双重检查URL: ${cleanUrl}`);

    // 优先使用 Chrome extension API
    if (this.canUseExtensionAPI()) {
      try {
        chrome.runtime.sendMessage({type: 'findConversationByUrl', url: cleanUrl}, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('AI Chat Memory: 双重检查URL查询失败，改为创建新会话:', chrome.runtime.lastError);
            this.createNewConversation(messages, cleanUrl, resolve, reject);
          } else if (response && response.conversation) {
            const extId = this.lastKnownConversationId;
            if (extId && response.conversation.externalId && response.conversation.externalId !== extId) {
              console.log('AI Chat Memory: 双重检查发现URL归属其他外部ID，继续创建新会话');
              this.createNewConversation(messages, cleanUrl, resolve, reject);
              return;
            }
            console.log(`AI Chat Memory: 双重检查找到现有会话: ${response.conversation.conversationId}`);
            // 如外部ID缺失则补写
            if (extId && !response.conversation.externalId) {
              try {
                response.conversation.externalId = extId;
                chrome.runtime.sendMessage({ type: 'updateConversation', conversation: response.conversation }, () => {});
              } catch (_) {}
            }
            resolve(response.conversation.conversationId);
          } else {
            console.log(`AI Chat Memory: 确认需要创建新会话: ${cleanUrl}`);
            this.createNewConversation(messages, cleanUrl, resolve, reject);
          }
        });
      } catch (error) {
        console.warn('AI Chat Memory: 双重检查调用异常，改为创建新会话:', error);
        this.createNewConversation(messages, cleanUrl, resolve, reject);
      }
    } else if (this.storageManager) {
      this.storageManager.findConversationByUrl(cleanUrl)
        .then(conversation => {
          if (conversation) {
            const extId = this.lastKnownConversationId;
            if (extId && conversation.externalId && conversation.externalId !== extId) {
              console.log('AI Chat Memory: 双重检查发现URL归属其他外部ID，继续创建新会话');
              this.createNewConversation(messages, cleanUrl, resolve, reject);
              return;
            }
            console.log(`AI Chat Memory: 双重检查找到现有会话: ${conversation.conversationId}`);
            if (extId && !conversation.externalId && this.storageManager && this.storageManager.updateConversation) {
              try {
                conversation.externalId = extId;
                this.storageManager.updateConversation(conversation);
              } catch (_) {}
            }
            resolve(conversation.conversationId);
          } else {
            console.log(`AI Chat Memory: 确认需要创建新会话: ${cleanUrl}`);
            this.createNewConversation(messages, cleanUrl, resolve, reject);
          }
        })
        .catch(() => {
          this.createNewConversation(messages, cleanUrl, resolve, reject);
        });
    } else {
      this.createNewConversation(messages, cleanUrl, resolve, reject);
    }
  }

  /**
   * 创建新会话
   */
  async createNewConversation(messages, cleanUrl, resolve, reject) {
    const title = this.extractTitle() || this.generateTitleFromMessages(messages);

    const conversation = {
      conversationId: this.generateId(),
      link: cleanUrl,
      title: title,
      platform: this.platform,
      messages: messages,
      externalId: this.lastKnownConversationId || null
    };

    console.log(`AI Chat Memory: 创建新对话，包含消息数量: ${messages.length}`);

    try {
      let conversationId;

      // 优先使用 Chrome extension API
      if (this.canUseExtensionAPI()) {
        try {
          const response = await this.sendMessageWithRetry({
            type: 'createConversation',
            conversation: conversation
          });

          if (response && response.conversationId) {
            if (window.aiChatMemoryCommon) {
              window.aiChatMemoryCommon.showSuccessStatus();
            }
            console.log(`AI Chat Memory: 成功创建新会话: ${response.conversationId}`);
            conversationId = response.conversationId;
          } else {
            throw new Error('创建会话失败: ' + (response?.error || '未知错误'));
          }
        } catch (error) {
          console.error('AI Chat Memory: 扩展API创建对话失败，回退到本地存储:', error);
          if (this.storageManager) {
            conversationId = await this.storageManager.createConversation(conversation);
            console.log(`AI Chat Memory: 通过本地存储创建新会话: ${conversationId}`);
          } else {
            throw error;
          }
        }
      } else if (this.storageManager) {
        conversationId = await this.storageManager.createConversation(conversation);
      } else {
        throw new Error('没有可用的存储方法');
      }

      resolve(conversationId);
    } catch (error) {
      console.error('AI Chat Memory: 创建对话失败:', error);
      reject(error);
    }
  }

  /**
   * 通过外部ID查找会话
   */
  async findConversationByExternalId(externalId) {
    // 优先使用 Chrome extension API
    if (this.canUseExtensionAPI()) {
      try {
        const response = await this.sendMessageWithRetry({ type: 'findConversationByExternalId', externalId });
        return response ? (response.conversation || null) : null;
      } catch (error) {
        console.warn('AI Chat Memory: 按外部ID获取会话失败，回退到本地存储:', error);
        if (/Extension context invalidated/i.test(String(error && error.message))) {
          this.forceLocalStorageMode = true;
        }
        if (this.storageManager && this.storageManager.findConversationByExternalId) {
          return await this.storageManager.findConversationByExternalId(externalId);
        }
        return null;
      }
    } else if (this.storageManager && this.storageManager.findConversationByExternalId) {
      return await this.storageManager.findConversationByExternalId(externalId);
    }
    return null;
  }

  /**
   * 从消息中生成标题
   */
  generateTitleFromMessages(messages) {
    const firstUserMessage = messages.find(m => m.sender === 'user');
    if (firstUserMessage) {
      const text = firstUserMessage.content;
      return text.length > 50 ? text.substring(0, 50) + '...' : text;
    }
    return '新对话';
  }

  // ========== DOM监听逻辑 ==========

  /**
   * 设置DOM变化监听
   */
  setupMutationObserver() {
    console.log('AI Chat Memory: 设置内容观察器');

    this.updateCurrentMessagesMap();

    const observer = new MutationObserver((mutations) => {
      if (window.aiChatMemorySettings && !window.aiChatMemorySettings.autoSave) {
        return;
      }

      let hasRelevantChanges = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList') {
          // 检查新增的节点
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE && this.isMessageElement(node)) {
              hasRelevantChanges = true;
              break;
            }
          }

          // 检查删除的节点
          if (!hasRelevantChanges) {
            for (const node of mutation.removedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE && this.isMessageElement(node)) {
                hasRelevantChanges = true;
                break;
              }
            }
          }
        } else if (mutation.type === 'characterData' || mutation.type === 'childList') {
          let targetNode = mutation.target;
          while (targetNode && targetNode !== document.body) {
            if (this.isMessageElement(targetNode)) {
              hasRelevantChanges = true;
              break;
            }
            targetNode = targetNode.parentNode;
          }
        }
        if (hasRelevantChanges) break;
      }

      if (hasRelevantChanges) {
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.checkForActualMessageChanges();
        }, this.DEBOUNCE_DELAY);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    });

    return observer;
  }

  /**
   * 更新当前消息映射
   */
  updateCurrentMessagesMap() {
    const messages = this.extractMessages();
    const newMap = new Map();

    messages.forEach(message => {
      newMap.set(message.messageId, message.content);
    });

    this.currentMessagesMap = newMap;
    return messages;
  }

  /**
   * 检查当前所有消息与上次比较，判断是否有变化
   */
  async checkForActualMessageChanges() {
    if (!window.aiChatMemorySettings || !window.aiChatMemorySettings.autoSave) {
      return;
    }

    const currentUrl = window.location.href;
    if (!this.isValidConversationUrl(currentUrl)) {
      console.log('AI Chat Memory: 当前URL不是有效的对话页面，跳过保存');
      return;
    }

    if (!this.currentConversationId) {
      return;
    }

    console.log('AI Chat Memory: 检查消息实际变化...');

    const currentMessages = this.extractMessages();

    if (currentMessages.length === 0) {
      return;
    }

    const messagesForComparison = currentMessages.map(msg => {
      const { timestamp, ...rest } = msg;
      return rest;
    });
    const currentMessagesJson = JSON.stringify(messagesForComparison);

    if (this.lastMessagesJson === currentMessagesJson) {
      console.log('AI Chat Memory: 消息内容无变化，跳过保存');
      return;
    }

    this.lastMessagesJson = currentMessagesJson;
    console.log('AI Chat Memory: 检测到消息变化，触发保存');

    this.updateCurrentMessagesMap();
    await this.checkForNewMessages();
  }

  /**
   * 检查新消息
   */
  async checkForNewMessages() {
    if (this.isChecking) return;

    if (!window.aiChatMemorySettings || !window.aiChatMemorySettings.autoSave) {
      return;
    }

    if (!this.currentConversationId) {
      try {
        this.isChecking = true;
        console.log('AI Chat Memory: 自动保存模式，首次创建对话');
        const convId = await this.findOrCreateConversation();
        this.currentConversationId = convId;
      } catch (error) {
        console.error('创建会话失败:', error);
      } finally {
        this.isChecking = false;
      }
      return;
    }

    this.isChecking = true;

    try {
      await this.saveAllMessages();
    } catch (error) {
      console.error('AI Chat Memory: 检查新消息失败:', error);
    } finally {
      this.isChecking = false;
    }
  }

  // ========== 保存逻辑 ==========

  /**
   * 处理手动保存按钮点击事件
   */
  async handleManualSave() {
    console.log('AI Chat Memory: 手动保存按钮被点击');

    const currentUrl = window.location.href;
    if (!this.isValidConversationUrl(currentUrl)) {
      console.log(`AI Chat Memory: 当前页面不是有效的${this.platform}对话页面，无法保存`);
      return;
    }

    try {
      const { conversationId, isNewConversation } = this.extractConversationInfo(currentUrl);

      if (conversationId) {
        this.lastKnownConversationId = conversationId;
      }

      await this.connectToDatabase();

      const foundConversationId = await this.findOrCreateConversation();

      if (!foundConversationId) {
        console.log('AI Chat Memory: 手动保存 - 无法找到或创建对话');
        return;
      }

      this.currentConversationId = foundConversationId;
      console.log('AI Chat Memory: 手动保存 - 当前会话ID:', this.currentConversationId);

      await this.saveAllMessages();

      console.log('AI Chat Memory: 手动保存完成');

    } catch (error) {
      console.error('AI Chat Memory: 手动保存失败:', error);

      if (window.aiChatMemoryCommon) {
        window.aiChatMemoryCommon.showErrorStatus();
      }
    }
  }

  /**
   * 保存所有消息
   */
  async saveAllMessages() {
    try {
      if (!this.currentConversationId) {
        console.log('AI Chat Memory: 未找到会话ID，无法保存');
        return;
      }

      const attemptSave = async (retryCount = 0) => {
        const messages = this.extractMessages();
        console.log(`AI Chat Memory: 提取到消息数量: ${messages.length}`);

        if (messages.length === 0 && retryCount < 2) {
          console.log(`AI Chat Memory: 保存时暂无消息，${500 * (retryCount + 1)}ms后重试 (${retryCount + 1}/2)`);
          setTimeout(() => attemptSave(retryCount + 1), 500 * (retryCount + 1));
          return;
        }

        if (messages.length === 0) {
          console.log('AI Chat Memory: 没有消息内容，跳过保存');
          return;
        }

        // 检查核心组件是否加载完成
        if (!this.compatibility || !this.storageManager) {
          console.error('AI Chat Memory: 核心组件未加载，无法保存消息');
          console.error('AI Chat Memory: StorageManager:', !!this.storageManager, 'Compatibility:', !!this.compatibility);
          return;
        }

        // 使用智能增量更新
        await this.performIncrementalSave();
      };

      await attemptSave();
    } catch (error) {
      console.error('AI Chat Memory: 保存消息失败:', error);
    }
  }

  /**
   * 解耦后的增量保存逻辑（懒加载感知）
   */
  async performIncrementalSave() {
    const currentMessages = this.extractMessages();

    // 优先使用 Chrome extension API 进行更新
    let result;
    if (this.canUseExtensionAPI()) {
      try {
        const existingConversation = await this.getConversationById(this.currentConversationId);

        if (existingConversation) {
          // 合并消息
          existingConversation.messages = currentMessages;
          existingConversation.updatedAt = new Date().toISOString();

          // Monica: 当标题为空或为通用站点标题时，尝试用更有意义的标题更新
          if (this.platform === 'monica') {
            const newTitle = this.extractTitle() || this.generateTitleFromMessages(currentMessages);
            const isGeneric = (t) => {
              if (!t) return true;
              const s = String(t).trim();
              return /^Monica(\s*[-|—].*)?$/i.test(s) || /Your ChatGPT AI Assistant/i.test(s) || /Chrome Extension/i.test(s);
            };
            if ((!existingConversation.title || isGeneric(existingConversation.title)) && newTitle) {
              existingConversation.title = newTitle;
            }
          }

          const updateResponse = await this.sendMessageWithRetry({
            type: 'updateConversation',
            conversation: existingConversation
          });

          if (updateResponse && updateResponse.status === 'ok') {
            result = { success: true, action: 'updated' };
          } else {
            throw new Error('更新对话失败');
          }
        } else {
          // 如果对话不存在，创建新对话
          const cleanUrl = this.pageUrl.split('?')[0];
          const title = this.extractTitle() || this.generateTitleFromMessages(currentMessages);

          const conversation = {
            conversationId: this.currentConversationId,
            link: cleanUrl,
            title: title,
            platform: this.platform,
            messages: currentMessages,
            externalId: this.lastKnownConversationId || null
          };

          const createResponse = await this.sendMessageWithRetry({
            type: 'createConversation',
            conversation: conversation
          });

          if (createResponse && createResponse.conversationId) {
            result = { success: true, action: 'created' };
          } else {
            throw new Error('创建对话失败');
          }
        }
      } catch (error) {
        console.warn('AI Chat Memory: 扩展API增量更新失败，回退到本地存储:', error);
        if (/Extension context invalidated/i.test(String(error && error.message))) {
          this.forceLocalStorageMode = true;
        }
        if (this.storageManager) {
          result = await this.storageManager.smartIncrementalUpdate(
            this.currentConversationId,
            currentMessages
          );
          console.log('AI Chat Memory: 通过本地存储完成增量更新');
        } else {
          result = { success: false, error: error.message };
        }
      }
    } else if (this.storageManager) {
      // 回退到本地 StorageManager
      result = await this.storageManager.smartIncrementalUpdate(
        this.currentConversationId,
        currentMessages
      );
    } else {
      result = { success: false, error: '没有可用的存储方法' };
    }

    if (result && result.success) {
      console.log('AI Chat Memory: 智能增量更新完成');
      if (window.aiChatMemoryCommon) {
        window.aiChatMemoryCommon.showSuccessStatus();
      }
    } else {
      console.error('AI Chat Memory: 智能增量更新失败', result);
    }
  }

  // ========== 工具方法 ==========

  /**
   * 生成消息唯一ID
   */
  generateMessageId(sender, content, index) {
    return `msg_${sender}_position_${index}`;
  }

  /**
   * 生成对话唯一ID
   */
  generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * 提取格式化内容的所有可见文本
   */
  extractFormattedContent(element) {
    if (!element) return '';

    const text = element.innerText || element.textContent || '';
    return text.trim().replace(/\n\s*\n\s*\n/g, '\n\n');
  }

  // ========== URL监控逻辑 ==========

  /**
   * 启动URL监控
   */
  startUrlWatcher() {
    console.log('AI Chat Memory: URL监控启动');

    if (this.urlCheckInterval) clearInterval(this.urlCheckInterval);

    this.handleUrlCheck();
    this.urlCheckInterval = setInterval(() => this.handleUrlCheck(), 1000);
  }

  /**
   * 检查URL变化并广播事件
   */
  handleUrlCheck() {
    const currentUrl = window.location.href;
    const currentBaseUrl = currentUrl.split('?')[0];

    if (!this.isValidConversationUrl(currentUrl)) {
      return;
    }

    const { conversationId, isNewConversation } = this.extractConversationInfo(currentUrl);

    if (!conversationId) {
      return;
    }

    if (currentBaseUrl !== this.lastKnownUrl || conversationId !== this.lastKnownConversationId) {
      console.log(`AI Chat Memory: 检测到变化 - 新URL: ${currentBaseUrl}`);
      console.log(`AI Chat Memory: 对话ID变化: ${this.lastKnownConversationId || '无'} -> ${conversationId || '无'}`);

      this.lastKnownUrl = currentBaseUrl;
      this.lastKnownConversationId = conversationId;

      window.dispatchEvent(new CustomEvent('ai-chat-memory-url-changed', {
        detail: {
          url: currentUrl,
          conversationId: conversationId,
          isNewConversation: isNewConversation
        }
      }));
    }
  }

  // ========== 事件监听设置 ==========

  /**
   * 设置事件监听器
   */
  setupEventListeners() {
    // 手动保存监听器
    window.removeEventListener('ai-chat-memory-manual-save', this.handleManualSave.bind(this));
    window.addEventListener('ai-chat-memory-manual-save', this.handleManualSave.bind(this));

    // URL变化监听器
    window.addEventListener('ai-chat-memory-url-changed', (event) => {
      console.log('AI Chat Memory: 收到URL变化事件');

      const { url, conversationId, isNewConversation } = event.detail;

      if (url && this.isValidConversationUrl(url) && conversationId) {
        setTimeout(() => {
          this.initAdapter({
            url: url,
            conversationId: conversationId,
            isNewConversation: isNewConversation
          });
        }, 100);
      }
    });

    // 设置更新监听器
    if (typeof chrome !== 'undefined' && chrome.runtime) {
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          if (message.type === 'settingsUpdated' && message.settings) {
            window.aiChatMemorySettings = Object.assign({}, window.aiChatMemorySettings, message.settings);
            console.log(`AI Chat Memory: ${this.platform}适配器收到设置更新`, message.settings);
            console.log('AI Chat Memory: 设置已更新，悬浮标签状态将自动同步');
          }
          sendResponse({status: 'ok'});
          return true;
        });
      } catch (err) {
        console.warn('AI Chat Memory: 注册消息监听器失败，使用本地模式:', err);
        this.forceLocalStorageMode = true;
      }
    }
  }

  /**
   * 设置页面卸载检测
   */
  setupPageUnloadDetection() {
    let isUnloading = false;
    window.addEventListener('beforeunload', function() { isUnloading = true; });
    window.aiChatMemory = Object.assign(window.aiChatMemory || {}, {
      isPageUnloading: () => isUnloading
    });
  }

  // ========== 启动逻辑 ==========

  /**
   * 初始启动
   */
  initialBoot() {
    if (window.aiChatMemorySettings) {
      this.startUrlWatcher();
    } else {
      setTimeout(() => this.initialBoot(), 100);
    }
  }

  /**
   * 启动适配器
   */
  start() {
    // 添加重试机制
    const retryInit = (retryCount = 0) => {
      try {
        // 检查扩展上下文
        if (this.canUseExtensionAPI()) {
          console.log(`AI Chat Memory: 扩展上下文有效，开始初始化 (${retryCount}/5)`);
          this.init();
          this.setupEventListeners();
          this.setupPageUnloadDetection();
          this.initialBoot();
        } else {
          throw new Error('扩展上下文不可用');
        }
      } catch (error) {
        console.warn(`AI Chat Memory: 初始化失败 (${retryCount}/5):`, error.message);

        if (retryCount < 5) {
          setTimeout(() => retryInit(retryCount + 1), 1000 * (retryCount + 1));
        } else {
          console.error('AI Chat Memory: 达到最大重试次数，初始化失败');
          // 即使扩展API不可用，也尝试使用本地存储
          if (this.storageManager) {
            console.log('AI Chat Memory: 尝试使用本地存储模式');
            this.init();
            this.setupEventListeners();
            this.setupPageUnloadDetection();
            this.initialBoot();
          }
        }
      }
    };

    retryInit();
  }

  /**
   * 检查是否处于编辑状态
   */
  isInEditMode(element) {
    if (!element) return false;
    const activeTextarea = element.querySelector('textarea:focus');
    return !!activeTextarea;
  }
}

// 导出基类
if (typeof window !== 'undefined') {
  window.BasePlatformAdapter = BasePlatformAdapter;
}
