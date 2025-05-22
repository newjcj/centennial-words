// popup.js
document.addEventListener('DOMContentLoaded', () => {
  // Tab switching logic
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');

      tabContents.forEach(content => content.classList.remove('active'));
      document.getElementById(button.dataset.tab).classList.add('active');

      // If settings tab is activated, load settings
      if (button.dataset.tab === 'settingsTab') {
        loadSettings();
      }
    });
  });

  // Settings elements
  const apiKeyInput = document.getElementById('apiKey');
  const showAdvancedHistoryCheckbox = document.getElementById('showAdvancedHistory');
  const saveSettingsButton = document.getElementById('saveSettings');
  const settingsStatus = document.getElementById('settingsStatus');
  const sortOption = document.getElementById('sortOption');

  let historyData = [];
  let showAdvancedHistory = false;

  // Load settings function
  function loadSettings() {
    chrome.storage.sync.get(['apiKey', 'showAdvancedHistory'], (settings) => {
      if (chrome.runtime.lastError) {
        console.error("Error loading settings:", chrome.runtime.lastError.message);
        settingsStatus.textContent = '加载设置失败。';
        settingsStatus.className = 'status-message error';
        return;
      }
      if (settings.apiKey) {
        apiKeyInput.value = settings.apiKey;
      }
      
      // 加载高级历史记录设置
      showAdvancedHistory = settings.showAdvancedHistory || false;
      showAdvancedHistoryCheckbox.checked = showAdvancedHistory;
      
      // 如果设置了不显示高级历史功能，隐藏排序控件
      document.querySelector('.sort-controls').style.display = showAdvancedHistory ? 'flex' : 'none';
    });
  }

  // Save settings function
  if(saveSettingsButton) {
    saveSettingsButton.addEventListener('click', () => {
      const apiKey = apiKeyInput.value.trim();
      const newShowAdvancedHistory = showAdvancedHistoryCheckbox.checked;

      if (!apiKey) {
        settingsStatus.textContent = 'API Key 不能为空。';
        settingsStatus.className = 'status-message error';
        setTimeout(() => { settingsStatus.textContent = ''; settingsStatus.className = 'status-message'; }, 3000);
        return;
      }

      chrome.storage.sync.set({
        apiKey: apiKey,
        showAdvancedHistory: newShowAdvancedHistory
      }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving settings:", chrome.runtime.lastError.message);
          settingsStatus.textContent = '保存设置失败。';
          settingsStatus.className = 'status-message error';
        } else {
          settingsStatus.textContent = '设置已保存！';
          settingsStatus.className = 'status-message success';
          showAdvancedHistory = newShowAdvancedHistory;
          
          // 重新渲染历史记录，以反映设置更改
          displayHistory(historyData);
          document.querySelector('.sort-controls').style.display = showAdvancedHistory ? 'flex' : 'none';
        }
        setTimeout(() => { settingsStatus.textContent = ''; settingsStatus.className = 'status-message'; }, 3000);
      });
    });
  }

  // Initial load for settings
  chrome.storage.sync.get(['showAdvancedHistory'], (settings) => {
    showAdvancedHistory = settings.showAdvancedHistory || false;
    // 根据设置显示/隐藏排序控件
    document.querySelector('.sort-controls').style.display = showAdvancedHistory ? 'flex' : 'none';
    
    // 如果settings tab是活跃的，加载全部设置
    if (document.querySelector('.tab-button[data-tab="settingsTab"].active')) {
      loadSettings();
    }
  });

  // History tab logic
  const historyList = document.getElementById('historyList');
  const noHistoryDiv = document.getElementById('noHistory');
  const clearHistoryButton = document.getElementById('clearHistory');

  // 请求历史记录
  chrome.runtime.sendMessage({ type: "GET_HISTORY" }, (response) => {
    if (chrome.runtime.lastError) {
      console.error("Error getting history:", chrome.runtime.lastError.message);
      historyList.innerHTML = '<li>加载历史记录失败。</li>';
      noHistoryDiv.style.display = 'none';
      return;
    }
    if (response && response.history && response.history.length > 0) {
      historyData = response.history;
      displayHistory(historyData);
      noHistoryDiv.style.display = 'none';
    } else {
      historyList.innerHTML = '';
      noHistoryDiv.style.display = 'block';
    }
  });

  // 排序选择变化事件
  sortOption.addEventListener('change', () => {
    if (historyData.length > 0) {
      displayHistory(historyData);
    }
  });

  // 清空历史记录按钮事件
  clearHistoryButton.addEventListener('click', () => {
    chrome.storage.local.set({ history: [] }, () => {
      historyList.innerHTML = '';
      historyData = [];
      noHistoryDiv.style.display = 'block';
    });
  });

  // 格式化时间戳为具体时间（精确到分钟）
  function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  }

  // 计算重复次数颜色（从蓝色到红色的渐变）
  function getRepeatCountColor(count) {
    if (count <= 1) return '#3498db'; // 默认蓝色
    
    // 定义最大重复次数范围，超过这个值就使用最红的颜色
    const maxCount = 10;
    const normalizedCount = Math.min(count - 1, maxCount - 1) / (maxCount - 1);
    
    // 蓝色RGB: 52, 152, 219
    // 红色RGB: 231, 76, 60
    const r = Math.round(52 + normalizedCount * (231 - 52));
    const g = Math.round(152 + normalizedCount * (76 - 152));
    const b = Math.round(219 + normalizedCount * (60 - 219));
    
    return `rgb(${r}, ${g}, ${b})`;
  }

  // 处理详情按钮点击事件，显示/隐藏时间戳详情
  function toggleTimestampsDetail(event, detailsDiv) {
    event.preventDefault();
    event.stopPropagation();
    
    if (detailsDiv.style.display === 'block') {
      detailsDiv.style.display = 'none';
      event.target.textContent = '详情';
    } else {
      detailsDiv.style.display = 'block';
      event.target.textContent = '收起';
    }
  }

  function displayHistory(history) {
    historyList.innerHTML = ''; // 清空现有列表
    
    // 根据选择的排序方式进行排序
    const sortedHistory = [...history];
    if (sortOption.value === 'repeat') {
      sortedHistory.sort((a, b) => {
        const countA = a.repeatCount || 1;
        const countB = b.repeatCount || 1;
        return countB - countA; // 降序排列
      });
    }
    
    sortedHistory.forEach(item => {
      const listItem = document.createElement('li');
      const timeAgo = formatTimeAgo(item.timestamp);

      const wordSpan = document.createElement('strong');
      wordSpan.textContent = item.word;

      const translationDiv = document.createElement('div');
      translationDiv.className = 'translation-text';
      translationDiv.textContent = item.translation;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'time-ago';
      timeSpan.textContent = ` - ${timeAgo}`;

      listItem.appendChild(wordSpan);
      listItem.appendChild(document.createTextNode(': ')); // 分隔符
      
      // 显示重复次数（如果设置允许且次数大于1）
      const repeatCount = item.repeatCount || 1;
      if (showAdvancedHistory && repeatCount > 1) {
        const repeatSpan = document.createElement('span');
        repeatSpan.className = 'repeat-count';
        repeatSpan.textContent = `${repeatCount}次`;
        repeatSpan.style.backgroundColor = getRepeatCountColor(repeatCount);
        repeatSpan.style.color = '#fff';
        listItem.appendChild(repeatSpan);
        
        // 添加详情按钮
        const detailButton = document.createElement('button');
        detailButton.className = 'detail-button';
        detailButton.textContent = '详情';
        listItem.appendChild(detailButton);
        
        // 创建时间戳详情div
        const timestampsDiv = document.createElement('div');
        timestampsDiv.className = 'timestamps-details';
        
        // 添加时间戳列表
        if (item.timestamps && item.timestamps.length > 0) {
          const timestampsList = document.createElement('ul');
          item.timestamps.forEach(ts => {
            const tsItem = document.createElement('li');
            tsItem.textContent = formatTimestamp(ts);
            timestampsList.appendChild(tsItem);
          });
          timestampsDiv.appendChild(timestampsList);
        } else {
          timestampsDiv.textContent = '没有详细记录';
        }
        
        // 添加点击事件
        detailButton.addEventListener('click', (e) => toggleTimestampsDetail(e, timestampsDiv));
      }
      
      listItem.appendChild(translationDiv);
      listItem.appendChild(timeSpan);
      
      // 如果有详情div，添加到列表项
      if (showAdvancedHistory && repeatCount > 1) {
        const timestampsDiv = document.createElement('div');
        timestampsDiv.className = 'timestamps-details';
        
        // 添加时间戳列表
        if (item.timestamps && item.timestamps.length > 0) {
          const timestampsList = document.createElement('ul');
          item.timestamps.forEach(ts => {
            const tsItem = document.createElement('li');
            tsItem.textContent = formatTimestamp(ts);
            timestampsList.appendChild(tsItem);
          });
          timestampsDiv.appendChild(timestampsList);
        } else {
          timestampsDiv.textContent = '没有详细记录';
        }
        
        listItem.appendChild(timestampsDiv);
      }
      
      historyList.appendChild(listItem);
    });
  }

  function formatTimeAgo(timestamp) {
    const now = new Date();
    const past = new Date(timestamp);
    const diffInSeconds = Math.floor((now - past) / 1000);

    const minutes = Math.floor(diffInSeconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}天前`;
    if (hours > 0) return `${hours}小时前`;
    if (minutes > 0) return `${minutes}分钟前`;
    return '刚刚';
  }
});