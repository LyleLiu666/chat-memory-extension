(function initAiChatMemoryLogger(globalScope) {
  if (!globalScope || !globalScope.console) {
    return;
  }

  if (globalScope.__aiChatMemoryLoggerInitialized) {
    return;
  }
  globalScope.__aiChatMemoryLoggerInitialized = true;

  const originalLog = typeof globalScope.console.log === 'function'
    ? globalScope.console.log.bind(globalScope.console)
    : function noop() {};
  const noop = function () {};
  const DEBUG_STORAGE_KEY = 'AI_CHAT_MEMORY_DEBUG';

  const readInitialState = () => {
    if (typeof globalScope.__AI_CHAT_MEMORY_DEBUG__ !== 'undefined') {
      return !!globalScope.__AI_CHAT_MEMORY_DEBUG__;
    }

    try {
      if (typeof globalScope.localStorage !== 'undefined' && globalScope.localStorage) {
        return globalScope.localStorage.getItem(DEBUG_STORAGE_KEY) === '1';
      }
    } catch (_) {
      // Ignore storage access issues (e.g., blocked by site policies)
    }

    return false;
  };

  const persistState = (enabled) => {
    try {
      if (typeof globalScope.localStorage !== 'undefined' && globalScope.localStorage) {
        if (enabled) {
          globalScope.localStorage.setItem(DEBUG_STORAGE_KEY, '1');
        } else {
          globalScope.localStorage.removeItem(DEBUG_STORAGE_KEY);
        }
      }
    } catch (_) {
      // Ignore persistence failures
    }
  };

  let debugEnabled = readInitialState();

  const applyLogBehavior = () => {
    if (debugEnabled) {
      globalScope.console.log = originalLog;
    } else {
      globalScope.console.log = noop;
    }
  };

  const setDebugState = (enabled, shouldPersist) => {
    debugEnabled = !!enabled;
    applyLogBehavior();
    if (shouldPersist) {
      persistState(debugEnabled);
    }
  };

  applyLogBehavior();

  const loggerApi = {
    enableDebug(persist = false) {
      setDebugState(true, persist);
    },
    disableDebug(persist = false) {
      setDebugState(false, persist);
    },
    isDebugEnabled() {
      return debugEnabled;
    },
    withOriginalLog(callback, ...args) {
      if (typeof callback === 'function') {
        callback(originalLog, ...args);
      }
    }
  };

  Object.defineProperty(globalScope, 'aiChatMemoryLogger', {
    value: loggerApi,
    configurable: true,
    enumerable: false,
    writable: false
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof window !== 'undefined' ? window : self));
