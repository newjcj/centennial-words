// content.js

let translationTooltip = null;
let isContentScriptReady = false;

// 确保页面完全加载后再初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initContentScript);
} else {
  initContentScript();
}

// 初始化content script
function initContentScript() {
  if (isContentScriptReady) return;
  
  // 标记content script已准备就绪
  isContentScriptReady = true;
  console.log('百年单词: Content script 初始化成功');
  
  // 向background.js发送准备就绪消息
  try {
    chrome.runtime.sendMessage({ type: "CONTENT_SCRIPT_READY" }, response => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.log("发送准备就绪消息时出错:", error.message);
      } else {
        console.log("Content script ready message sent", response);
      }
    });
  } catch (error) {
    console.error("发送准备就绪消息失败:", error);
  }
}

// 监听来自background.js的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Content script received message:", request);
  try {
    if (request.type === "SHOW_TRANSLATION_RESULT") {
      if (request.error) {
        showTranslation(request.error, true);
      } else {
        showTranslation(`<strong>${request.text}:</strong><br>${request.translation}`);
      }
      // 发送回应确认消息已收到
      if (sendResponse) {
        sendResponse({ received: true });
      }
    } else {
      // 对于其他类型的消息，也返回响应
      if (sendResponse) {
        sendResponse({ received: true, type: "unknown" });
      }
    }
  } catch (error) {
    console.error("处理消息时出错:", error);
    if (sendResponse) {
      sendResponse({ error: error.message });
    }
  }
  return true;
});

function showTranslation(message, isError = false) {
  try {
    // 移除已存在的提示框
    if (translationTooltip) {
      translationTooltip.remove();
    }

    // 创建新的提示框元素
    translationTooltip = document.createElement('div');
    translationTooltip.id = 'bainian-translate-tooltip';
    translationTooltip.innerHTML = message;

    // 设置样式
    Object.assign(translationTooltip.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: isError ? '#ffdddd' : '#e6f7ff',
      border: `1px solid ${isError ? '#ff4d4f' : '#91d5ff'}`,
      padding: '10px 15px',
      borderRadius: '5px',
      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      zIndex: '999999999', // 确保在最上层
      maxWidth: '300px',
      fontSize: '14px',
      lineHeight: '1.5',
      color: isError ? '#cf1322' : '#000',
      fontFamily: 'Arial, sans-serif'
    });

    document.body.appendChild(translationTooltip);
    console.log("显示翻译结果:", message);

    // 3秒后自动消失，错误信息停留更久
    setTimeout(() => {
      if (translationTooltip) {
        translationTooltip.remove();
        translationTooltip = null;
      }
    }, isError ? 6000 : 3000);

    // 点击提示框外部关闭
    document.addEventListener('click', handleClickOutside, true);
  } catch (error) {
    console.error("显示翻译结果时出错:", error);
  }
}

function handleClickOutside(event) {
  if (translationTooltip && !translationTooltip.contains(event.target)) {
    translationTooltip.remove();
    translationTooltip = null;
    document.removeEventListener('click', handleClickOutside, true);
  }
}

// 监听页面卸载，清理事件监听器
window.addEventListener('beforeunload', () => {
  if (translationTooltip) {
    translationTooltip.remove();
  }
  document.removeEventListener('click', handleClickOutside, true);
});