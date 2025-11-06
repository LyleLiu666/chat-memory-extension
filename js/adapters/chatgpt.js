/**
 * AI Chat Memory - ChatGPT平台适配器
 * 继承BasePlatformAdapter，只实现平台特定的逻辑
 */

class ChatGPTAdapter extends BasePlatformAdapter {
  constructor() {
    super('chatgpt');
  }

  /**
   * 验证是否为有效的ChatGPT对话URL
   * @param {string} url - 要验证的URL
   * @returns {boolean} - 是否为有效的对话URL
   */
  isValidConversationUrl(url) {
    try {
      const urlObj = new URL(url);
      const hostname = urlObj.hostname;
      const pathname = urlObj.pathname;

      if (!hostname.includes('chatgpt.com') && !hostname.includes('chat.openai.com')) {
        return false;
      }

      const validPatterns = [
        /^\/c\/[^/]+$/, // /c/conversation_id
        /^\/g\/[^/]+\/c\/[^/]+$/ // /g/gpt_id/c/conversation_id
      ];

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

      const pathWithoutLeadingSlash = pathname.startsWith('/') ? pathname.substring(1) : pathname;

      if (pathWithoutLeadingSlash &&
          pathWithoutLeadingSlash !== '' &&
          pathWithoutLeadingSlash !== 'c' &&
          pathWithoutLeadingSlash !== 'chat') {
        result.conversationId = pathWithoutLeadingSlash.replace(/\//g, '_');

        console.log(`AI Chat Memory: 提取到ChatGPT对话ID: ${result.conversationId}`);
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
    return (
      node.nodeType === Node.ELEMENT_NODE &&
      (node.hasAttribute && node.hasAttribute('data-testid') &&
       node.getAttribute('data-testid').startsWith('conversation-turn-')) ||
      (node.hasAttribute && node.hasAttribute('data-message-author-role'))
    );
  }

  /**
   * 提取页面上的所有消息
   * @returns {Array} - 消息数组
   */
  extractMessages() {
    const messages = [];

    const conversationContainer = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;

    if (!conversationContainer) {
      console.log('AI Chat Memory: 未找到对话容器');
      return messages;
    }

    const articleContainers = conversationContainer.querySelectorAll('article');

    const existTextarea = Array.from(articleContainers).find(element => this.isInEditMode(element));
    if (existTextarea) {
      console.log('AI Chat Memory: 检测到用户正在编辑，跳过消息提取');
      return [];
    }
    const userMessages = conversationContainer.querySelectorAll('div[data-message-author-role="user"]');
    const aiMessages = conversationContainer.querySelectorAll('div[data-message-author-role="assistant"]');

    console.log(`AI Chat Memory: 找到 ${userMessages.length} 条用户消息, ${aiMessages.length} 条AI消息`);

    const allMessageElements = [];

    userMessages.forEach(element => {
      allMessageElements.push({ element, type: 'user' });
    });

    aiMessages.forEach(element => {
      allMessageElements.push({ element, type: 'ai' });
    });

    // 按DOM中的实际位置排序
    allMessageElements.sort((a, b) => {
      const position = a.element.compareDocumentPosition(b.element);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      } else if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });

    allMessageElements.forEach((messageInfo, index) => {
      messageInfo.position = index;
    });

    allMessageElements.forEach((messageInfo, index) => {
      const { element, type } = messageInfo;

      if (type === 'user') {
        const userTextElement = element.querySelector('.whitespace-pre-wrap');
        if (userTextElement && userTextElement.innerText.trim()) {
          const content = userTextElement.innerText.trim();
          const messageId = this.generateMessageId('user', content, index);

          messages.push({
            messageId,
            sender: 'user',
            content,
            thinking: '',
            position: index,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      } else if (type === 'ai') {
        let thinking = '';
        let content = '';

        // 提取 AI thinking 文本
        const potentialThinkingElements = element.querySelectorAll(':scope > div:not(.markdown)');
        potentialThinkingElements.forEach(ptElement => {
          if (ptElement.offsetParent !== null && ptElement.innerText && ptElement.innerText.trim() !== '') {
            if (!ptElement.querySelector('button') && !ptElement.classList.contains('flex')) {
              thinking = ptElement.innerText.trim();
            }
          }
        });

        // 提取 AI 正式消息文本
        const aiMarkdownElement = element.querySelector('.markdown.prose');
        if (aiMarkdownElement) {
          content = this.extractFormattedContent(aiMarkdownElement);
        }

        if (content) {
          const messageId = this.generateMessageId('AI', content, index);

          messages.push({
            messageId,
            sender: 'AI',
            content,
            thinking,
            position: index,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });
        }
      }
    });

    console.log(`AI Chat Memory: ChatGPT成功提取 ${messages.length} 条消息`);
    return messages;
  }
}

function initChatGPTAdapter() {
  if (typeof BasePlatformAdapter === 'undefined') {
    console.error('AI Chat Memory: BasePlatformAdapter未加载');
    return;
  }

  const adapter = new ChatGPTAdapter();
  adapter.start();
}

initChatGPTAdapter();