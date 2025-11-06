// 调试脚本 - 检查扩展加载状态
console.log('🔍 AI Chat Memory Debug Script');

// 检查基础环境
console.log('📋 Environment Check:');
console.log('- chrome.runtime available:', typeof chrome !== 'undefined' && !!chrome.runtime);
console.log('- chrome.storage available:', typeof chrome !== 'undefined' && !!chrome.storage);
console.log('- URL:', window.location.href);
console.log('- User Agent:', navigator.userAgent.substring(0, 50));

// 检查DOM元素
console.log('📋 DOM Check:');
setTimeout(() => {
  // ChatGPT specific checks
  if (window.location.hostname.includes('chatgpt.com') || window.location.hostname.includes('chat.openai.com')) {
    console.log('- ChatGPT page detected');

    const mainContainer = document.querySelector('main') || document.querySelector('[role="main"]') || document.body;
    console.log('- Main container found:', !!mainContainer);

    const articles = mainContainer.querySelectorAll('article');
    console.log('- Articles found:', articles.length);

    const userMessages = document.querySelectorAll('div[data-message-author-role="user"]');
    const aiMessages = document.querySelectorAll('div[data-message-author-role="assistant"]');
    console.log('- User messages:', userMessages.length);
    console.log('- AI messages:', aiMessages.length);
  }

  // Gemini specific checks
  if (window.location.hostname.includes('gemini.google.com')) {
    console.log('- Gemini page detected');

    const chatHistory = document.querySelector('#chat-history');
    console.log('- Chat history container found:', !!chatHistory);

    const conversationBlocks = chatHistory ? chatHistory.querySelectorAll('.conversation-container') : [];
    console.log('- Conversation blocks found:', conversationBlocks.length);
  }

  // Monica specific checks
  if (window.location.hostname.includes('monica.im')) {
    console.log('- Monica page detected');

    const potentialContainers = document.querySelectorAll('.message, .chat-message, .conversation-message, [data-testid*="message"]');
    console.log('- Potential message containers found:', potentialContainers.length);
  }
}, 2000);

// 检查全局变量
setTimeout(() => {
  console.log('📋 Global Variables Check:');
  console.log('- BasePlatformAdapter available:', typeof BasePlatformAdapter !== 'undefined');
  console.log('- StorageManager available:', typeof StorageManager !== 'undefined');
  console.log('- aiChatMemorySettings available:', typeof window.aiChatMemorySettings !== 'undefined');
  console.log('- aiChatMemoryCommon available:', typeof window.aiChatMemoryCommon !== 'undefined');
  console.log('- aiChatMemory available:', typeof window.aiChatMemory !== 'undefined');

  // 检查是否有浮动标签
  const floatTags = document.querySelectorAll('[data-ai-chat-memory-tag], .ai-chat-memory-float');
  console.log('- Float tags found:', floatTags.length);
}, 3000);

// 尝试手动触发保存
setTimeout(() => {
  console.log('📋 Manual Save Test:');
  console.log('- Dispatching manual save event...');
  window.dispatchEvent(new CustomEvent('ai-chat-memory-manual-save'));
}, 5000);

console.log('🔍 Debug script loaded. Check console for results.');