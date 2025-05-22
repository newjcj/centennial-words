// options.js

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('save').addEventListener('click', saveOptions);
  document.getElementById('testConnection').addEventListener('click', testApiConnection);
  document.getElementById('exportHistory').addEventListener('click', exportHistoryData);
  document.getElementById('importHistory').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', handleFileUpload);
});

const defaultApiEndpoint = 'https://qianfan.baidubce.com/v2/';
const defaultPromptText = "你是一个经验丰富的英语老师，但是回答很精炼，每次回答不超过50个字，简单的问题不超过15个字";

// 保存选项到 chrome.storage
function saveOptions() {
  const apiKey = document.getElementById('apiKey').value;
  const apiEndpoint = document.getElementById('apiEndpoint').value || defaultApiEndpoint;
  const customPrompt = document.getElementById('customPrompt').value || defaultPromptText;

  chrome.storage.sync.set({
    apiKey: apiKey,
    apiEndpoint: apiEndpoint,
    customPrompt: customPrompt
  }, () => {
    // 更新状态消息
    const status = document.getElementById('status');
    status.textContent = '选项已保存。';
    status.className = 'status success';
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 1500);
  });
}

// 导出历史记录
async function exportHistoryData() {
  const status = document.getElementById('status');
  status.textContent = '正在导出历史记录...';
  status.className = 'status pending';

  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error sending message to background script:", chrome.runtime.lastError);
      status.textContent = `导出失败: ${chrome.runtime.lastError.message || "未知错误"}`;
      status.className = 'status error';
      return;
    }

    if (response && response.history && response.history.length > 0) {
      try {
        const historyJson = JSON.stringify(response.history, null, 2);
        const blob = new Blob([historyJson], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 10);
        a.download = `bainian_history_export_${timestamp}.json`;
        document.body.appendChild(a); // Required for Firefox
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        status.textContent = '历史记录已成功导出！';
        status.className = 'status success';
      } catch (error) {
        console.error("Error processing history for export:", error);
        status.textContent = `导出失败: ${error.message || "处理数据时发生错误"}`;
        status.className = 'status error';
      }
    } else {
      status.textContent = '没有历史记录可以导出。';
      status.className = 'status info'; // Using 'info' or a similar neutral class
    }
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 3000); // Clear status after 3 seconds
  });
}

// 处理文件上传和导入
async function handleFileUpload(event) {
  const file = event.target.files[0];
  const status = document.getElementById('status');

  if (!file) {
    return;
  }

  status.textContent = '正在导入历史记录...';
  status.className = 'status pending';

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const importedHistory = JSON.parse(e.target.result);
      if (!Array.isArray(importedHistory)) {
        status.textContent = '导入失败：JSON文件内容不是有效的历史记录格式。';
        status.className = 'status error';
        event.target.value = null; // Reset file input
        return;
      }
      await processImportedHistory(importedHistory);
    } catch (error) {
      status.textContent = '导入失败：文件格式错误或非JSON文件。';
      status.className = 'status error';
      console.error("Error parsing imported JSON:", error);
    } finally {
      event.target.value = null; // Reset file input
      // Clear status message after a delay, handled within processImportedHistory or a dedicated function
    }
  };
  reader.onerror = () => {
    status.textContent = '导入失败：无法读取文件。';
    status.className = 'status error';
    event.target.value = null; // Reset file input
  };
  reader.readAsText(file);
}

async function processImportedHistory(importedHistory) {
  const status = document.getElementById('status'); // Ensure status is accessible
  status.textContent = '正在处理导入的数据...';
  status.className = 'status pending';

  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = `导入失败：无法获取现有历史记录。 ${chrome.runtime.lastError.message}`;
      status.className = 'status error';
      console.error("Error getting history for import:", chrome.runtime.lastError);
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
      return;
    }

    let currentHistory = response.history || [];
    const existingWords = new Set(currentHistory.map(item => item.word));
    let importedCount = 0;
    let duplicateCount = 0;
    const historyLimit = 1000;

    // Iterate in reverse to add newer items from the file first, effectively making them older in the combined list
    // if we unshift. Or iterate normally and unshift, which means items at top of file are newest.
    // The user likely expects items at the top of their exported file to be the "latest" they exported,
    // so unshifting them will place them as newest in the application.
    for (const item of importedHistory) {
      if (!item || typeof item.word !== 'string' || typeof item.translation !== 'string') {
        console.warn("Skipping invalid item during import:", item);
        continue; // Skip invalid items
      }

      if (existingWords.has(item.word)) {
        duplicateCount++;
      } else {
        const newItem = {
          word: item.word,
          translation: item.translation,
          timestamp: item.timestamp || new Date().toISOString(), // Use existing or new timestamp
          repeatCount: item.repeatCount || 1,
          timestamps: Array.isArray(item.timestamps) && item.timestamps.length > 0 
                        ? item.timestamps 
                        : [item.timestamp || new Date().toISOString()],
          ef: item.ef || 2.5,
          interval: item.interval || 0,
          dueDate: item.dueDate || new Date().toISOString()
        };
        currentHistory.unshift(newItem); // Add to the beginning
        existingWords.add(newItem.word); // Add to set to prevent duplicates from within the imported file itself if any
        importedCount++;
      }
    }

    currentHistory = currentHistory.slice(0, historyLimit); // Enforce history limit

    chrome.runtime.sendMessage({ type: "UPDATE_HISTORY", history: currentHistory }, (updateResponse) => {
      if (chrome.runtime.lastError) {
        status.textContent = `导入失败：无法保存更新后的历史记录。 ${chrome.runtime.lastError.message}`;
        status.className = 'status error';
        console.error("Error updating history after import:", chrome.runtime.lastError);
      } else if (updateResponse && updateResponse.success) {
        status.textContent = `成功导入 ${importedCount} 条记录，${duplicateCount} 条重复记录被跳过。`;
        status.className = 'status success';
      } else {
        status.textContent = `导入失败：${updateResponse.error || "未知错误"}`;
        status.className = 'status error';
      }
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 5000); // Longer display for result
    });
  });
}

// 从 chrome.storage 加载选项并显示在表单中
function restoreOptions() {
  chrome.storage.sync.get({
    apiKey: '',
    apiEndpoint: defaultApiEndpoint,
    customPrompt: defaultPromptText
  }, (items) => {
    document.getElementById('apiKey').value = items.apiKey;
    document.getElementById('apiEndpoint').value = items.apiEndpoint;
    document.getElementById('customPrompt').value = items.customPrompt;
    // 设置占位符，如果值为空则显示默认值
    if (!items.apiEndpoint) {
        document.getElementById('apiEndpoint').placeholder = `默认为: ${defaultApiEndpoint}`;
    }
    if (!items.customPrompt) {
        document.getElementById('customPrompt').placeholder = `默认为: ${defaultPromptText}`;
    }
  });
}

// 测试API连接
function testApiConnection() {
  const apiKey = document.getElementById('apiKey').value;
  const apiEndpoint = document.getElementById('apiEndpoint').value || defaultApiEndpoint;
  const status = document.getElementById('status');
  
  if (!apiKey) {
    status.textContent = '请输入API Key后再测试连接';
    status.className = 'status error';
    return;
  }
  
  status.textContent = '正在测试API连接...';
  status.className = 'status pending';
  
  // 基本验证
  if (!apiEndpoint.startsWith('http')) {
    status.textContent = `API端点格式错误: ${apiEndpoint}，应以http或https开头`;
    status.className = 'status error';
    return;
  }
  
  chrome.runtime.sendMessage({
    type: "TEST_API_CONNECTION",
    apiKey: apiKey,
    apiEndpoint: apiEndpoint
  }, (response) => {
    console.log("测试API连接响应:", response);
    
    if (response && response.success) {
      status.textContent = '连接成功! API可正常访问。';
      status.className = 'status success';
    } else {
      let errorMsg = response && response.error 
        ? response.error 
        : '无法连接到API，请检查API Key和Endpoint是否正确';
        
      status.textContent = `连接失败: ${errorMsg}`;
      status.className = 'status error';
    }
  });
}