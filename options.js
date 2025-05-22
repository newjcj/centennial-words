// options.js

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  document.getElementById('save').addEventListener('click', saveOptions);
  document.getElementById('testConnection').addEventListener('click', testApiConnection);
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