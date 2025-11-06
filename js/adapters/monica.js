/**
 * AI Chat Memory - Monica平台适配器
 * 继承BasePlatformAdapter，只实现平台特定的逻辑
 */

class MonicaAdapter extends BasePlatformAdapter {
  constructor() {
    super('monica');
  }

  /**
   * 验证是否为有效的Monica对话URL
   * @param {string} url - 要验证的URL
   * @returns {boolean} - 是否为有效的对话URL
   */
  isValidConversationUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;

      // 支持monica.im和app.monica.im
      if (!hostname.includes('monica.im')) {
        return false;
      }

      const pathname = urlObj.pathname;

      // 排除登录页、设置页等非对话页面
      const excludePatterns = [
        /^\/login/,
        /^\/register/,
        /^\/settings/,
        /^\/billing/,
        /^\/profile/
      ];

      // 如果是排除的页面，返回false
      if (excludePatterns.some(pattern => pattern.test(pathname))) {
        return false;
      }

      // 有效的对话页面通常包含chat、conversation或类似路径
      const validPatterns = [
        /\/chat(\/|$)/,
        /\/conversation(\/|$)/,
        /^\/home\/chat(\/|$)/,
        /\/c\//,
        /\/t\//
      ];

      return validPatterns.some(pattern => pattern.test(pathname));
    } catch (error) {
      console.error('AI Chat Memory: Monica URL验证失败:', error);
      return false;
    }
  }

  /**
   * 从URL中提取对话ID
   * @param {string} url - 要分析的URL
   * @returns {Object} - 包含对话ID和是否为新对话的对象
   */
  extractConversationInfo(url) {
    const result = {
      conversationId: null,
      isNewConversation: false
    };

    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const searchParams = urlObj.searchParams;

      // 移除开头的斜杠
      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      // 分析路径段
      const pathSegments = pathWithoutLeadingSlash.split('/');

      // 根据Monica的URL格式提取对话ID
      let conversationId = null;

      // 优先使用 query 参数（例如 convId）
      const qpConvIdRaw = searchParams.get('convId') || searchParams.get('conversationId') || searchParams.get('cid');
      const qpConvId = qpConvIdRaw ? decodeURIComponent(qpConvIdRaw) : null;
      if (qpConvId && typeof qpConvId === 'string') {
        conversationId = qpConvId;
      }

      // 常见的Monica对话URL模式
      if (!conversationId && pathSegments.length >= 2) {
        const seg0 = pathSegments[0];
        const seg1 = pathSegments[1];
        const looksLikeConv = (s) => typeof s === 'string' && (/^conv[_:]/.test(s) || /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(s));

        if ((seg0 === 'chat' || seg0 === 'conversation' || seg0 === 'c' || seg0 === 't') && looksLikeConv(seg1)) {
          conversationId = seg1;
        }
        // 不再从 /home/chat/... 的其他段构造ID，避免误判
      }

      // 不再使用路径兜底为ID，等待真正的会话ID出现，避免混淆
      const sanitize = (s) => (s || '').replace(/[\/:?&=#%]/g, '_');

      if (conversationId) {
        // 统一清理，保证ID稳定
        const sanitized = sanitize(conversationId);
        result.conversationId = sanitized;
        // 避免重复刷屏日志，仅在变化时记录
        this._lastLoggedConversationId = this._lastLoggedConversationId || null;
        if (this._lastLoggedConversationId !== sanitized) {
          console.log(`AI Chat Memory: 提取到Monica对话ID: ${sanitized}`);
          this._lastLoggedConversationId = sanitized;
        }
      }

      return result;
    } catch (error) {
      console.error('AI Chat Memory: 解析Monica URL时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素
   * @param {Node} node - 要检查的DOM节点
   * @returns {boolean} - 是否为消息元素
   */
  isMessageElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return false;
    }

    // Monica可能的消息容器选择器
    const messageSelectors = [
      '.message',
      '.chat-message',
      '.conversation-message',
      '[data-testid*="message"]',
      '.msg-item',
      '.chat-item',
      '.message-item',
      '.message-bubble',
      '.chat-bubble',
      // 新版类名（模糊匹配）
      '[class*="chat-message"]',
      '[class*="message--"]',
      '[class*="chat-question"]',
      '[class*="chat-answer"]'
    ];

    // 检查当前元素
    for (const selector of messageSelectors) {
      if (node.matches && node.matches(selector)) {
        return true;
      }
    }

    // 检查是否有消息内容的子元素
    const contentSelectors = [
      '.message-content',
      '.chat-content',
      '.text-content',
      '.msg-text',
      '.message-text',
      '[class*="content"]',
      '[class*="text"]'
    ];

    for (const selector of contentSelectors) {
      if (node.querySelector && node.querySelector(selector)) {
        return true;
      }
    }

    // 检查父元素是否为消息容器
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      for (const selector of messageSelectors) {
        if (parent.matches && parent.matches(selector)) {
          return true;
        }
      }
      parent = parent.parentElement;
    }

    return false;
  }

  /**
   * 从页面提取标题
   * @returns {string|null} - 提取的标题或null
   */
  extractTitle() {
    // 优先：从聊天标题元素获取（更稳定）
    const titleSelectors = [
      '.chat-title',
      '.conversation-title',
      '.chat-header h1',
      '.chat-header h2',
      '.conversation-header h1',
      '.conversation-header h2',
      '[data-testid*="chat-title"]',
      '[data-testid*="conversation-title"]',
      '[class*="chat-title"], [class*="conversation-title"]',
      'h1[class*="title"], h2[class*="title"]'
    ];

    for (const selector of titleSelectors) {
      const element = document.querySelector(selector);
      if (element && element.textContent && element.textContent.trim()) {
        const t = element.textContent.trim();
        const norm = this.normalizeTitle(t);
        if (norm) return norm;
      }
    }

    // 尝试从第一条用户消息获取标题
    const firstUserMessage = this.getFirstUserMessage();
    if (firstUserMessage && firstUserMessage.content) {
      return firstUserMessage.content.length > 50 ?
        firstUserMessage.content.substring(0, 50) + '...' :
        firstUserMessage.content;
    }

    // 退而求其次：从页面<title>获取，但过滤掉通用无意义标题
    const titleElement = document.querySelector('title');
    if (titleElement && titleElement.textContent.trim()) {
      const t = titleElement.textContent.trim();
      const norm = this.normalizeTitle(t);
      if (norm) return norm;
    }

    return null;
  }

  normalizeTitle(raw) {
    if (!raw) return null;
    let title = String(raw).trim();
    // 去掉常见后缀/前缀
    title = title.replace(/\s*[-|—]\s*Monica$/i, '').trim();
    // 过滤掉无意义的通用标题
    const genericPatterns = [
      /^Monica\s*[-|—]/i,
      /^Monica$/i,
      /Your ChatGPT AI Assistant/i,
      /Chrome Extension/i
    ];
    if (genericPatterns.some(p => p.test(raw))) return null;
    return title.length > 2 ? (title.length > 50 ? title.substring(0, 50) + '...' : title) : null;
  }

  /**
   * 提取页面上的所有消息
   * @returns {Array} - 消息数组
   */
  extractMessages() {
    const messages = [];

    // 尝试找到聊天容器
    const chatContainer = this.findChatContainer();
    if (!chatContainer) {
      console.log('AI Chat Memory: 未找到Monica聊天容器');
      return messages;
    }

    // 检查是否在编辑状态
    if (this.isInEditMode(chatContainer)) {
      console.log('AI Chat Memory: 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    // 查找所有消息元素
    const messageElements = this.findAllMessageElements(chatContainer);
    console.log(`AI Chat Memory: 找到 ${messageElements.length} 个Monica消息元素`);

    messageElements.forEach((element, index) => {
      const message = this.extractMessageFromElement(element, index);
      if (message) {
        messages.push(message);
      }
    });

    console.log(`AI Chat Memory: Monica成功提取 ${messages.length} 条消息`);
    return messages;
  }

  /**
   * 查找聊天容器
   */
  findChatContainer() {
    const containerSelectors = [
      // 常规类名
      '.chat-container',
      '.conversation-container',
      '.messages-container',
      '.chat-messages',
      '.conversation-messages',
      '.chat-main',
      '.conversation-main',
      '#chat-container',
      '#messages-container',
      '[data-testid*="chat-container"]',
      '[data-testid*="messages-container"]',
      // Monica 新版常见 BEM/哈希类名（使用模糊匹配）
      '[class*="chat-items-container"]',
      '[class*="chat-items"]',
      '[class*="chat-body"]',
      '[class*="chat-content"]',
      '[class*="chat-root"]'
    ];

    // 优先返回可见容器
    for (const selector of containerSelectors) {
      const candidates = Array.from(document.querySelectorAll(selector));
      const visible = candidates.find(el => this.isElementVisible(el));
      if (visible) return visible;
      if (candidates.length > 0) return candidates[0];
    }

    // 回退1：查找包含大量消息元素的容器（模糊匹配类名）
    try {
      const allElements = document.querySelectorAll('*');
      for (const element of allElements) {
        const messageCount = element.querySelectorAll('[class*="chat-message"], [class*="message--"], [data-testid*="message"]').length;
        if (messageCount > 2 && this.isElementVisible(element)) {
          return element;
        }
      }
    } catch (_) {}

    // 回退2：在可访问的 iframe 中查找（同源）
    try {
      const iframes = document.querySelectorAll('iframe');
      for (const iframe of Array.from(iframes)) {
        let doc = null;
        try {
          doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
        } catch (_) {
          // 跨域无法访问
          doc = null;
        }
        if (!doc) continue;

        for (const selector of containerSelectors) {
          const candidate = doc.querySelector(selector);
          if (candidate) return candidate;
        }

        const richContainer = Array.from(doc.querySelectorAll('*')).find(el =>
          el.querySelectorAll('[class*="chat-message"], [class*="message--"], [data-testid*="message"]').length > 2
        );
        if (richContainer) return richContainer;
      }
    } catch (_) {}

    return null;
  }

  /**
   * 查找所有消息元素
   */
  findAllMessageElements(container) {
    const messageSelectors = [
      '.message',
      '.chat-message',
      '.conversation-message',
      '[data-testid*="message"]',
      '.msg-item',
      '.chat-item',
      '.message-item',
      // 模糊匹配新版类名
      '[class*="chat-message"]',
      '[class*="message--"]',
      '[class*="chat-question"]',
      '[class*="chat-answer"]'
    ];

    let messageElements = [];

    for (const selector of messageSelectors) {
      const elements = container.querySelectorAll(selector);
      if (elements.length > 0) {
        messageElements = Array.from(elements);
        break;
      }
    }

    // 如果没有找到消息元素，尝试更通用的方法
    if (messageElements.length === 0) {
      messageElements = Array.from(container.querySelectorAll('*')).filter(child => this.isMessageElement(child));
    }

    // 仅保留可见消息元素，避免 Monica 切换时隐藏旧消息导致混淆
    messageElements = messageElements.filter(el => this.isElementVisible(el));

    return messageElements;
  }

  /**
   * 从元素中提取消息
   */
  extractMessageFromElement(element, index) {
    try {
      if (!this.isElementVisible(element)) return null;
      const sender = this.determineSender(element);
      const content = this.extractContent(element);

      if (!content || content.trim() === '') {
        return null;
      }

      const messageId = this.generateMessageId(sender, content, index);

      return {
        messageId,
        sender,
        content: content.trim(),
        thinking: '', // Monica通常不显示thinking过程
        position: index,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('AI Chat Memory: 提取Monica消息失败:', error);
      return null;
    }
  }

  // 判断元素是否可见（排除 display:none / visibility:hidden / 尺寸为0 / 祖先隐藏）
  isElementVisible(el) {
    try {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      if (rect.width === 0 && rect.height === 0) return false;
      let p = el.parentElement;
      while (p && p !== document.body) {
        const s = window.getComputedStyle(p);
        if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
        p = p.parentElement;
      }
      return true;
    } catch (_) {
      return true;
    }
  }

  /**
   * 判断消息发送者
   */
  determineSender(element) {
    // 检查元素的类名或属性来确定发送者
    const elementClasses = element.className || '';
    const elementData = element.dataset || {};

    // 用户消息的常见标识
    const userIndicators = [
      'user',
      'sender-user',
      'from-user',
      'outgoing',
      'sent',
      'message-user',
      // Monica 常见
      'chat-question',
      'layout-right'
    ];

    // AI消息的常见标识
    const aiIndicators = [
      'ai',
      'assistant',
      'bot',
      'agent',
      'incoming',
      'received',
      'message-ai',
      'message-assistant',
      // Monica 常见
      'chat-answer',
      'layout-left'
    ];

    const lowerClasses = elementClasses.toLowerCase();

    // 检查类名
    for (const indicator of userIndicators) {
      if (lowerClasses.includes(indicator)) {
        return 'user';
      }
    }

    for (const indicator of aiIndicators) {
      if (lowerClasses.includes(indicator)) {
        return 'AI';
      }
    }

    // 检查data属性
    for (const [key, value] of Object.entries(elementData)) {
      const lowerKey = key.toLowerCase();
      const lowerValue = String(value).toLowerCase();

      if (lowerKey.includes('sender') || lowerKey.includes('role')) {
        for (const indicator of userIndicators) {
          if (lowerValue.includes(indicator)) {
            return 'user';
          }
        }
        for (const indicator of aiIndicators) {
          if (lowerValue.includes(indicator)) {
            return 'AI';
          }
        }
      }
    }

    // 回退策略：假设第一个消息是用户消息，交替判断
    const previousMessages = document.querySelectorAll('.message, .chat-message, [data-testid*="message"], [class*="chat-message"], [class*="message--"], [class*="chat-question"], [class*="chat-answer"]');
    const currentIndex = Array.from(previousMessages).indexOf(element);

    if (currentIndex === 0) {
      return 'user'; // 假设第一个消息是用户消息
    }

    // 如果是偶数位置，可能是用户消息
    return currentIndex % 2 === 0 ? 'user' : 'AI';
  }

  /**
   * 提取消息内容
   */
  extractContent(element) {
    const contentSelectors = [
      '.message-content',
      '.chat-content',
      '.text-content',
      '.msg-text',
      '.message-text',
      '[data-testid*="content"]',
      '[data-testid*="text"]',
      // 模糊匹配
      '[class*="message-content"]',
      '[class*="chat-content"]',
      '[class*="text-content"]',
      '[class*="message-text"]'
    ];

    for (const selector of contentSelectors) {
      const contentElement = element.querySelector(selector);
      if (contentElement && contentElement.textContent && contentElement.textContent.trim()) {
        return this.extractFormattedContent(contentElement);
      }
    }

    // 回退：直接从元素的文本内容获取
    return this.extractFormattedContent(element);
  }

  /**
   * 获取第一条用户消息（用于标题）
   */
  getFirstUserMessage() {
    const container = this.findChatContainer();
    if (!container) return null;

    const messageElements = this.findAllMessageElements(container);

    for (const element of messageElements) {
      const sender = this.determineSender(element);
      if (sender === 'user') {
        return this.extractMessageFromElement(element, 0);
      }
    }

    return null;
  }

  /**
   * 提取格式化内容
   * @param {Element} element - 包含格式化内容的元素
   * @returns {string} - 提取的文本内容
   */
  extractFormattedContent(element) {
    if (!element) return '';

    // 克隆节点以避免真实DOM被修改
    const clone = element.cloneNode(true);

    // 移除Monica界面上的工具按钮、模型切换区域等噪声元素
    const noiseSelectors = [
      '[class*="model-compare"]',
      '[class*="compare-header"]',
      '[class*="message-toolbar"]',
      '[class*="toolbar--"]',
      '[class*="monica-btn"]',
      '[class*="bot-icons"]',
      '[class*="popover-content"]',
      '[class*="close-btn"]',
      '[class*="reply-maker"]',
      '[class*="badge--"]',
      '[class*="share-button"]',
      '[data-testid*="message-toolbar"]'
    ];

    try {
      noiseSelectors.forEach(selector => {
        clone.querySelectorAll(selector).forEach(node => node.remove());
      });
    } catch (error) {
      console.warn('AI Chat Memory: 清理Monica噪声元素时出错', error);
    }

    const textContent = clone.innerText || clone.textContent || '';

    return textContent
      .split('\n')
      .map(line => line.trim())
      .filter((line, index, array) => {
        if (line) return true;
        const prevLine = array[index - 1];
        const nextLine = array[index + 1];
        return prevLine && nextLine && prevLine.trim() && nextLine.trim();
      })
      .join('\n')
      .trim();
  }
}

function initMonicaAdapter() {
  if (typeof BasePlatformAdapter === 'undefined') {
    console.error('AI Chat Memory: BasePlatformAdapter未加载');
    return;
  }

  console.log('AI Chat Memory: BasePlatformAdapter已加载');
  const adapter = new MonicaAdapter();
  adapter.start();
  console.log('AI Chat Memory: Monica适配器已启动');
}

initMonicaAdapter();
