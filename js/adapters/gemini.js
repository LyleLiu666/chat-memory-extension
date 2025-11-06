/**
 * AI Chat Memory - Gemini平台适配器
 * 继承BasePlatformAdapter，只实现平台特定的逻辑
 */

class GeminiAdapter extends BasePlatformAdapter {
  constructor() {
    super('gemini');
  }

  /**
   * 验证是否为有效的Gemini对话URL
   * @param {string} url - 要验证的URL
   * @returns {boolean} - 是否为有效的对话URL
   */
  isValidConversationUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('gemini.google.com')) {
        return false;
      }

      // 支持多种URL格式
      const validPatterns = [
        /^\/gem\/[^/]+\/[^/]+$/, // /gem/*/conversation_id
        /^\/app\/[^/]+$/, // /app/conversation_id
        /^\/[^/]+\/[^/]+\/app\/[^/]+$/, // /*/*/app/conversation_id
        /^\/[^/]+\/[^/]+\/gem\/[^/]+\/[^/]+$/ // /*/*/gem/*/conversation_id
      ];

      // 排除初始无内容页面
      if (pathname === '/app' ||
          /^\/gem\/[^/]+$/.test(pathname) ||
          /^\/[^/]+\/[^/]+\/app$/.test(pathname) ||
          /^\/[^/]+\/[^/]+\/gem\/[^/]+$/.test(pathname)) {
        return false;
      }

      return validPatterns.some(pattern => pattern.test(pathname));
    } catch (error) {
      console.error('AI Chat Memory: URL验证失败:', error);
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

      // 移除开头的斜杠，获取完整路径
      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      // 分析路径段
      const pathSegments = pathWithoutLeadingSlash.split('/');

      // 根据不同的路径格式提取对话ID
      let conversationId = null;

      if (pathSegments.length >= 2) {
        if (pathSegments[0] === 'app' && pathSegments[1]) {
          conversationId = pathSegments[1];
        }
        else if (pathSegments[0] === 'gem' && pathSegments.length >= 3 && pathSegments[2]) {
          conversationId = pathSegments[2];
        }
        else if (pathSegments.length >= 4 && pathSegments[2] === 'app' && pathSegments[3]) {
          conversationId = pathSegments[3];
        }
        else if (pathSegments.length >= 5 && pathSegments[2] === 'gem' && pathSegments[4]) {
          conversationId = pathSegments[4];
        }
      }

      if (conversationId) {
        // 使用完整路径作为对话ID，将斜杠替换为下划线
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');

        console.log(`AI Chat Memory: 提取到Gemini对话ID: ${result.conversationId}`);
      }

      return result;
    } catch (error) {
      console.error('AI Chat Memory: 解析URL时出错:', error);
      return result;
    }
  }

  /**
   * 检查元素是否为消息元素
   * @param {Node} node - 要检查的DOM节点
   * @returns {boolean} - 是否为消息元素
   */
  isMessageElement(node) {
    if (node.nodeType !== Node.ELEMENT_NODE || !node.classList) {
      return false;
    }

    if (node.classList.contains('conversation-container')) {
      return true;
    }

    if (node.tagName === 'USER-QUERY' || node.tagName === 'MODEL-RESPONSE') {
      return true;
    }

    // 检查是否包含消息内容元素
    if (node.querySelector('user-query') ||
        node.querySelector('model-response') ||
        node.querySelector('.query-text') ||
        node.querySelector('message-content')) {
      return true;
    }

    // 检查父元素是否为消息容器
    let parent = node.parentElement;
    while (parent && parent !== document.body) {
      if (parent.classList.contains('conversation-container') ||
          parent.tagName === 'USER-QUERY' ||
          parent.tagName === 'MODEL-RESPONSE') {
        return true;
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
    const titleElement = document.querySelector('title');
    if (titleElement && titleElement.textContent.trim()) {
      const title = titleElement.textContent.trim();
      if (title && title !== 'Gemini' && !title.includes('Google')) {
        return title.length > 50 ? title.substring(0, 50) + '...' : title;
      }
    }

    const firstUserMessage = document.querySelector('[data-test-id="user-message"]');
    if (firstUserMessage) {
      const text = firstUserMessage.innerText.trim();
      if (text) {
        return text.length > 50 ? text.substring(0, 50) + '...' : text;
      }
    }

    return null;
  }

  /**
   * 提取页面上的所有消息
   * @returns {Array} - 消息数组
   */
  extractMessages() {
    const messages = [];

    const chatHistoryContainer = document.querySelector('#chat-history');
    if (!chatHistoryContainer) {
      console.log('AI Chat Memory: 未找到聊天历史容器 #chat-history');
      return messages;
    }

    const conversationBlocks = chatHistoryContainer.querySelectorAll('.conversation-container');
    if (conversationBlocks.length === 0) {
      console.log('AI Chat Memory: 在 #chat-history 中未找到对话块');
      return messages;
    }

    console.log(`AI Chat Memory: 找到 ${conversationBlocks.length} 个对话块`);

    // 检查对话块中是否存在textarea（编辑状态）
    const existTextarea = Array.from(conversationBlocks).find(block => this.isInEditMode(block));
    if (existTextarea) {
      console.log('AI Chat Memory: 检测到用户正在编辑，跳过消息提取');
      return [];
    }

    conversationBlocks.forEach((block, blockIndex) => {
      // 提取用户消息
      const userQueryContainer = block.querySelector('user-query .query-text');
      if (userQueryContainer) {
        let userContent = '';

        userContent = this.extractFormattedContent(userQueryContainer);

        if (userContent && userContent.trim()) {
          const position = blockIndex * 2; // 用户消息在偶数位置
          const userMessageId = this.generateMessageId('user', userContent, position);

          messages.push({
            messageId: userMessageId,
            sender: 'user',
            content: userContent,
            thinking: '',
            position: position,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }

      // 提取AI响应
      const modelResponseEntity = block.querySelector('model-response');
      if (modelResponseEntity) {
        let aiContent = '';

        const messageContentContainer = modelResponseEntity.querySelector('.model-response-text');
        if (messageContentContainer) {
          aiContent = this.extractFormattedContent(messageContentContainer);
        }

        if (aiContent && aiContent.trim()) {
          const position = blockIndex * 2 + 1; // AI消息在奇数位置
          const aiMessageId = this.generateMessageId('AI', aiContent, position);

          messages.push({
            messageId: aiMessageId,
            sender: 'AI',
            content: aiContent,
            thinking: '',
            position: position,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    });

    console.log(`AI Chat Memory: 成功提取 ${messages.length} 条消息`);
    return messages;
  }

  /**
   * 提取格式化内容
   * @param {Element} element - 包含格式化内容的元素
   * @returns {string} - 提取的文本内容
   */
  extractFormattedContent(element) {
    if (!element) return '';

    const textContent = element.innerText || element.textContent || '';

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

function initGeminiAdapter() {
  if (typeof BasePlatformAdapter === 'undefined') {
    console.error('AI Chat Memory: BasePlatformAdapter未加载');
    return;
  }

  console.log('AI Chat Memory: BasePlatformAdapter已加载');
  const adapter = new GeminiAdapter();
  adapter.start();
  console.log('AI Chat Memory: Gemini适配器已启动');
}

initGeminiAdapter();