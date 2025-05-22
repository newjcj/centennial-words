// options.js

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('save').addEventListener('click', saveOptions);
  document.getElementById('testConnection').addEventListener('click', testApiConnection);
  document.getElementById('exportHistory').addEventListener('click', exportHistoryData);
  document.getElementById('importHistory').addEventListener('click', () => document.getElementById('importFile').click());
  document.getElementById('importFile').addEventListener('change', handleFileUpload);
  document.getElementById('loadHistoryToEditor').addEventListener('click', loadHistoryToEditor);
  document.getElementById('formatJsonInEditor').addEventListener('click', formatJsonInEditor);
  document.getElementById('saveHistoryFromEditor').addEventListener('click', saveHistoryFromEditor);
  document.getElementById('searchJsonInEditor').addEventListener('click', searchJsonInEditor);
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

// 搜索/过滤JSON编辑器中的内容
function searchJsonInEditor() {
  const editor = document.getElementById('jsonHistoryEditor');
  const searchQueryInput = document.getElementById('jsonSearchQuery');
  const status = document.getElementById('status');
  
  const query = searchQueryInput.value.trim().toLowerCase();
  const jsonString = editor.value;

  status.textContent = '正在搜索历史记录...';
  status.className = 'status pending';

  let historyArray;
  try {
    historyArray = JSON.parse(jsonString);
  } catch (error) {
    status.textContent = '编辑器中的JSON格式无效，无法搜索。';
    status.className = 'status error';
    console.error("Error parsing JSON for search:", error);
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  if (!Array.isArray(historyArray)) {
    status.textContent = '编辑器内容不是有效的JSON数组，无法搜索。';
    status.className = 'status error';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  if (!query) {
    // If query is empty, reformat the current content
    editor.value = JSON.stringify(historyArray, null, 2);
    status.textContent = '搜索词为空，已重新格式化编辑器内容。';
    status.className = 'status info';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  const filteredHistory = historyArray.filter(item => {
    const wordMatch = typeof item.word === 'string' && item.word.toLowerCase().includes(query);
    const translationMatch = typeof item.translation === 'string' && item.translation.toLowerCase().includes(query);
    return wordMatch || translationMatch;
  });

  editor.value = JSON.stringify(filteredHistory, null, 2);

  if (filteredHistory.length > 0) {
    status.textContent = `找到了 ${filteredHistory.length} 条匹配记录。`;
    status.className = 'status success';
  } else {
    status.textContent = '未找到匹配记录。';
    status.className = 'status info';
  }
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
}


// 保存编辑器中的历史记录
async function saveHistoryFromEditor() {
  const editor = document.getElementById('jsonHistoryEditor');
  const status = document.getElementById('status');
  const jsonString = editor.value;

  status.textContent = '正在保存历史记录...';
  status.className = 'status pending';

  let newHistoryArray;
  try {
    newHistoryArray = JSON.parse(jsonString);
  } catch (error) {
    status.textContent = '无效的JSON格式，无法保存。请检查语法。';
    status.className = 'status error';
    console.error("Error parsing JSON from editor:", error);
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  if (!Array.isArray(newHistoryArray)) {
    status.textContent = '顶层结构必须是JSON数组，无法保存。';
    status.className = 'status error';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  const validatedHistory = [];
  for (let i = 0; i < newHistoryArray.length; i++) {
    const item = newHistoryArray[i];
    if (typeof item !== 'object' || item === null) {
      status.textContent = `历史记录中的项目必须是对象，无法保存。第 ${i + 1} 项无效。`;
      status.className = 'status error';
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
      return;
    }
    if (typeof item.word !== 'string' || typeof item.translation !== 'string') {
      status.textContent = `历史记录项目缺少'word'或'translation'，或类型不正确。无法保存。第 ${i + 1} 项无效。`;
      status.className = 'status error';
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
      return;
    }
    // Add default values for other critical fields if missing
    validatedHistory.push({
      word: item.word,
      translation: item.translation,
      timestamp: item.timestamp || new Date().toISOString(),
      repeatCount: item.repeatCount || 1,
      timestamps: Array.isArray(item.timestamps) && item.timestamps.length > 0 
                    ? item.timestamps 
                    : [item.timestamp || new Date().toISOString()],
      ef: item.ef || 2.5,
      interval: item.interval || 0,
      dueDate: item.dueDate || new Date().toISOString()
    });
  }
  
  // Enforce history limit (optional, but good practice)
  const historyLimit = 1000;
  if (validatedHistory.length > historyLimit) {
      status.textContent = `历史记录超过 ${historyLimit} 条上限，请删减后再保存。当前条数: ${validatedHistory.length}`;
      status.className = 'status error';
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 5000);
      return;
  }


  chrome.runtime.sendMessage({ type: "UPDATE_HISTORY", history: validatedHistory }, (response) => {
    if (chrome.runtime.lastError) {
      status.textContent = `保存失败: ${chrome.runtime.lastError.message || "未知错误"}`;
      status.className = 'status error';
      console.error("Error saving history from editor (runtime.lastError):", chrome.runtime.lastError);
    } else if (response && response.success) {
      status.textContent = '历史记录已成功从编辑器保存。';
      status.className = 'status success';
    } else {
      status.textContent = `保存失败: ${response ? response.error : "未知错误"}`;
      status.className = 'status error';
      console.error("Error saving history from editor (response.error):", response ? response.error : "No response");
    }
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
  });
}

// 格式化JSON编辑器中的内容
function formatJsonInEditor() {
  const editor = document.getElementById('jsonHistoryEditor');
  const status = document.getElementById('status');
  const currentJson = editor.value;

  if (!currentJson.trim()) {
    status.textContent = '编辑器为空，无需格式化。';
    status.className = 'status info';
    setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
    return;
  }

  try {
    const parsedJson = JSON.parse(currentJson);
    editor.value = JSON.stringify(parsedJson, null, 2);
    status.textContent = 'JSON已成功格式化。';
    status.className = 'status success';
  } catch (error) {
    status.textContent = '无效的JSON格式，无法格式化。';
    status.className = 'status error';
    console.error("Error formatting JSON:", error);
  }
  setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 3000);
}

// 加载历史记录到JSON编辑器
async function loadHistoryToEditor() {
  const editor = document.getElementById('jsonHistoryEditor');
  const status = document.getElementById('status');

  status.textContent = '正在加载历史记录到编辑器...';
  status.className = 'status pending';

  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error loading history to editor:", chrome.runtime.lastError);
      editor.value = '加载历史记录失败。';
      status.textContent = `加载失败: ${chrome.runtime.lastError.message || "未知错误"}`;
      status.className = 'status error';
    } else if (response && response.history) {
      try {
        const jsonString = JSON.stringify(response.history, null, 2);
        editor.value = jsonString;
        status.textContent = '历史记录已加载到编辑器。';
        status.className = 'status success';
      } catch (error) {
        console.error("Error stringifying history for editor:", error);
        editor.value = '格式化历史记录失败。';
        status.textContent = `格式化失败: ${error.message || "处理数据时发生错误"}`;
        status.className = 'status error';
      }
    } else {
      editor.value = '[]'; // Show empty array if no history or unexpected response
      status.textContent = '没有历史记录可加载，或加载失败。';
      status.className = 'status info';
    }
    setTimeout(() => {
      status.textContent = '';
      status.className = 'status';
    }, 3000);
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