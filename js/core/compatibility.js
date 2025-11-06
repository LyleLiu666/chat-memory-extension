/**
 * AI Chat Memory - 兼容性工具类
 * 处理不同浏览器的兼容性问题和通用工具函数
 */

class Compatibility {
  constructor() {
    this.isChrome = typeof chrome !== 'undefined';
    this.isFirefox = typeof browser !== 'undefined';
    this.storageAPI = this.isChrome ? chrome.storage : browser.storage;
    this.runtimeAPI = this.isChrome ? chrome.runtime : browser.runtime;
  }

  /**
   * 获取存储API
   */
  getStorage() {
    return this.storageAPI;
  }

  /**
   * 获取运行时API
   */
  getRuntime() {
    return this.runtimeAPI;
  }

  /**
   * 安全的存储获取
   */
  async getStorageData(keys) {
    return new Promise((resolve, reject) => {
      this.storageAPI.sync.get(keys, (result) => {
        if (this.runtimeAPI.lastError) {
          reject(this.runtimeAPI.lastError);
        } else {
          resolve(result);
        }
      });
    });
  }

  /**
   * 安全的存储设置
   */
  async setStorageData(data) {
    return new Promise((resolve, reject) => {
      this.storageAPI.sync.set(data, () => {
        if (this.runtimeAPI.lastError) {
          reject(this.runtimeAPI.lastError);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * 时间工具类
 */
class TimeUtils {
  /**
   * 获取消息时间
   */
  static getMessageTime(message) {
    if (!message) return '';

    if (message.createdAt) return message.createdAt;
    if (message.timestamp) return message.timestamp;

    return new Date().toISOString();
  }

  /**
   * 格式化日期时间为显示格式
   */
  static formatDateTimeForDisplay(date) {
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

  /**
   * 格式化日期时间为文件名格式
   */
  static formatDateForFilename(date) {
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
}

/**
 * 文件名工具类
 */
class FilenameUtils {
  /**
   * 清理文件名字符串
   */
  static cleanFilename(filename, maxLength = 30) {
    if (!filename || typeof filename !== 'string') {
      return 'untitled';
    }

    // 截取指定长度
    let cleaned = filename.substring(0, maxLength);

    // 保留中文、日文、韩文、英文、数字，将其他字符替换为下划线
    cleaned = cleaned.replace(/[^\w\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/gi, '_');

    // 将空格替换为下划线
    cleaned = cleaned.replace(/\s+/g, '_');

    // 合并连续的下划线为单个下划线
    cleaned = cleaned.replace(/_+/g, '_');

    // 移除开头和结尾的下划线
    cleaned = cleaned.replace(/^_+|_+$/g, '');

    // 如果清理后为空，使用默认名称
    if (!cleaned) {
      return 'untitled';
    }

    return cleaned;
  }
}

// 导出工具类
if (typeof window !== 'undefined') {
  window.Compatibility = Compatibility;
  window.TimeUtils = TimeUtils;
  window.FilenameUtils = FilenameUtils;
}