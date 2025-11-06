/**
 * AI Chat Memory - 存储管理器
 * 负责IndexedDB的创建、读取、更新、删除操作
 */

class StorageManager {
  constructor() {
    this.DB_NAME = 'AIChatMemoryDB';
    this.DB_VERSION = 2;
    this.CONVERSATION_STORE = 'conversations';
    this.db = null;
  }

  /**
   * 初始化数据库连接
   */
  async initDB() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        let conversationStore;
        if (!db.objectStoreNames.contains(this.CONVERSATION_STORE)) {
          conversationStore = db.createObjectStore(this.CONVERSATION_STORE, { keyPath: 'conversationId' });
        } else {
          // 在升级事务中获取已存在的对象存储
          conversationStore = event.target.transaction.objectStore(this.CONVERSATION_STORE);
        }

        const ensureIndex = (store, name, keyPath, options = { unique: false }) => {
          if (!store.indexNames.contains(name)) {
            store.createIndex(name, keyPath, options);
          }
        };

        // 确保所有需要的索引都存在
        ensureIndex(conversationStore, 'link', 'link');
        ensureIndex(conversationStore, 'platform', 'platform');
        ensureIndex(conversationStore, 'updatedAt', 'updatedAt');
        ensureIndex(conversationStore, 'createdAt', 'createdAt');
        // 新增：基于外部会话ID（平台原始ID）的索引，用于避免不同会话被同一URL覆盖
        ensureIndex(conversationStore, 'externalId', 'externalId');
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 获取数据库实例
   */
  async getDB() {
    if (!this.db) {
      await this.initDB();
    }
    return this.db;
  }

  /**
   * 创建新会话
   */
  async createConversation(conversation) {
    const db = await this.getDB();

    // 生成唯一ID
    conversation.conversationId = conversation.conversationId || this.generateId();

    // 设置时间戳
    const now = new Date().toISOString();
    conversation.createdAt = conversation.createdAt || now;
    conversation.updatedAt = now;

    // 初始化消息数组
    if (!conversation.messages) {
      conversation.messages = [];
    }

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readwrite');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      const request = store.add(conversation);

      request.onsuccess = () => {
        resolve(conversation.conversationId);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 更新会话
   */
  async updateConversation(conversation) {
    const db = await this.getDB();

    // 更新时间戳
    conversation.updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readwrite');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      const request = store.put(conversation);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 根据ID获取会话
   */
  async getConversation(conversationId) {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readonly');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      const request = store.get(conversationId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 根据URL查找会话
   */
  async findConversationByUrl(url) {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readonly');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
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

  /**
   * 根据外部ID（平台原始对话ID）查找会话
   */
  async findConversationByExternalId(externalId) {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readonly');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      let index;
      try {
        index = store.index('externalId');
      } catch (e) {
        // 旧版本数据库没有该索引，直接返回null
        resolve(null);
        return;
      }
      const request = index.get(externalId);

      request.onsuccess = () => {
        resolve(request.result || null);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 获取所有会话
   */
  async getAllConversations() {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readonly');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        // 按最后消息时间倒序排序
        const conversations = request.result || [];
        conversations.sort((a, b) => {
          return new Date(this.getConversationSortTime(b)) - new Date(this.getConversationSortTime(a));
        });
        resolve(conversations);
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 删除会话
   */
  async deleteConversation(conversationId) {
    const db = await this.getDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction([this.CONVERSATION_STORE], 'readwrite');
      const store = transaction.objectStore(this.CONVERSATION_STORE);
      const request = store.delete(conversationId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = (event) => {
        reject(event.target.error);
      };
    });
  }

  /**
   * 智能增量更新
   */
  async smartIncrementalUpdate(conversationId, currentMessages) {
    try {
      // 获取已存储的会话
      const storedConversation = await this.getConversation(conversationId);

      if (!storedConversation) {
        // 如果不存在，创建新会话
        await this.createConversation({
          conversationId: conversationId,
          messages: currentMessages
        });
        return { success: true, action: 'created' };
      }

      const storedMessages = storedConversation.messages || [];

      // 计算变化
      const changes = this.calculateMessageChanges(storedMessages, currentMessages);

      if (this.hasChanges(changes)) {
        // 合并消息
        const updatedMessages = this.mergeMessages(storedMessages, currentMessages, changes);

        // 更新会话
        storedConversation.messages = updatedMessages;
        await this.updateConversation(storedConversation);

        return {
          success: true,
          action: 'updated',
          changes: changes,
          totalMessages: updatedMessages.length
        };
      }

      return { success: true, action: 'no_changes' };
    } catch (error) {
      console.error('智能增量更新失败:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 计算消息变化
   */
  calculateMessageChanges(storedMessages, currentMessages) {
    const changes = {
      newMessages: [],
      updatedMessages: [],
      removedMessages: []
    };

    // 创建消息映射
    const storedMap = new Map();
    storedMessages.forEach(msg => {
      storedMap.set(msg.messageId, msg);
    });

    const currentMap = new Map();
    currentMessages.forEach(msg => {
      currentMap.set(msg.messageId, msg);
    });

    // 找出新消息
    currentMessages.forEach(msg => {
      if (!storedMap.has(msg.messageId)) {
        changes.newMessages.push(msg);
      } else if (storedMap.get(msg.messageId).content !== msg.content) {
        changes.updatedMessages.push({
          messageId: msg.messageId,
          oldContent: storedMap.get(msg.messageId).content,
          newContent: msg.content
        });
      }
    });

    // 找出删除的消息
    storedMessages.forEach(msg => {
      if (!currentMap.has(msg.messageId)) {
        changes.removedMessages.push(msg);
      }
    });

    return changes;
  }

  /**
   * 检查是否有变化
   */
  hasChanges(changes) {
    return changes.newMessages.length > 0 ||
           changes.updatedMessages.length > 0 ||
           changes.removedMessages.length > 0;
  }

  /**
   * 合并消息
   */
  mergeMessages(storedMessages, currentMessages, changes) {
    // 简单实现：使用当前消息列表
    // 更复杂的实现可以基于changes进行精确合并
    return currentMessages;
  }

  /**
   * 获取对话的排序时间
   */
  getConversationSortTime(conversation) {
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

  /**
   * 生成唯一ID
   */
  generateId() {
    return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

// 导出存储管理器
if (typeof window !== 'undefined') {
  window.StorageManager = StorageManager;
}
