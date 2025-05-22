// background.js

// 监听扩展安装或更新事件，用于创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  // 首先移除已有的右键菜单项，以防止重复创建或状态不一致导致的问题
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "translateWithBaiNian",
      title: "使用百年单词翻译",
      contexts: ["selection"] // 仅在选中文本时显示
    });
    // 检查创建过程中是否发生错误，并在扩展的Service Worker控制台打印错误信息
    // 用户可以通过 chrome://extensions 页面 -> 开发者模式 -> 检查视图: service worker 查看
    if (chrome.runtime.lastError) {
      console.error(`创建右键菜单时出错: ${chrome.runtime.lastError.message}`);
    }
  });
});

// 检查标签页是否存在
async function tabExists(tabId) {
  try {
    // 尝试获取标签页信息
    const tab = await chrome.tabs.get(tabId);
    return !!tab; // 如果tab存在，返回true
  } catch (error) {
    console.log(`标签页 ${tabId} 不存在:`, error.message);
    return false;
  }
}

// 安全地向标签页发送消息，包含错误处理和注入脚本逻辑
async function sendMessageToTabSafely(tabId, message, needInjectOnError = true) {
  console.log(`尝试向标签页 ${tabId} 发送消息:`, message);
  
  // 首先检查标签页是否存在
  const exists = await tabExists(tabId);
  if (!exists) {
    console.log(`标签页 ${tabId} 不存在，无法发送消息`);
    return false;
  }
  
  // 尝试发送消息
  try {
    const response = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) {
          console.log(`向标签页 ${tabId} 发送消息时出错:`, error.message);
          resolve(null);
        } else {
          resolve(response);
        }
      });
    });
    
    if (response) {
      console.log(`标签页 ${tabId} 响应消息:`, response);
      return true;
    }
    
    // 如果需要注入脚本
    if (needInjectOnError) {
      console.log(`尝试向标签页 ${tabId} 注入content script`);
      
      // 再次检查标签页是否存在
      const stillExists = await tabExists(tabId);
      if (!stillExists) {
        console.log(`标签页 ${tabId} 不再存在，无法注入脚本`);
        return false;
      }
      
      try {
        await chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ["content.js"]
        });
        
        console.log(`成功向标签页 ${tabId} 注入content script`);
        
        // 延迟重新发送消息
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // 最后一次检查标签页是否存在
        const finalCheck = await tabExists(tabId);
        if (!finalCheck) {
          console.log(`标签页 ${tabId} 已关闭，无法发送消息`);
          return false;
        }
        
        // 再次尝试发送消息，不再递归注入
        return await sendMessageToTabSafely(tabId, message, false);
      } catch (error) {
        console.error(`向标签页 ${tabId} 注入content script失败:`, error.message);
        return false;
      }
    }
    
    return false;
  } catch (error) {
    console.error(`发送消息到标签页 ${tabId} 时发生未知错误:`, error);
    return false;
  }
}

// 检查网络连接
async function checkNetworkConnectivity() {
  try {
    const response = await fetch('https://www.baidu.com', { 
      method: 'HEAD',
      cache: 'no-store',
      mode: 'no-cors',
      redirect: 'follow'
    });
    return true;
  } catch (error) {
    console.error('网络连接检查失败:', error);
    return false;
  }
}

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log("右键菜单点击:", info);
  console.log("当前标签页信息:", tab);
  
  if (info.menuItemId === "translateWithBaiNian" && info.selectionText) {
    const selectedText = info.selectionText.trim();
    if (selectedText) {
      // 检查网络连接
      const isOnline = await checkNetworkConnectivity();
      if (!isOnline) {
        await sendMessageToTabSafely(tab.id, {
          type: "SHOW_TRANSLATION_RESULT",
          error: "网络连接失败，请检查您的互联网连接"
        });
        return;
      }

      // 获取存储的API Key和其他设置
      chrome.storage.sync.get(['apiKey', 'apiEndpoint', 'customPrompt'], async (settings) => {
        console.log("获取到的设置:", JSON.stringify({
          apiKeyLength: settings.apiKey ? settings.apiKey.length : 0,
          apiEndpoint: settings.apiEndpoint,
          customPromptLength: settings.customPrompt ? settings.customPrompt.length : 0
        }));

        const apiKey = settings.apiKey;
        const apiEndpoint = settings.apiEndpoint || 'https://qianfan.baidubce.com/v2/';
        const customPrompt = settings.customPrompt || "你是一个经验丰富的英语老师，但是回答很精炼，每次回答不超过50个字，简单的问题不超过15个字";

        if (!apiKey) {
          console.log("未设置API Key，提示用户进行设置");
          // 提示用户设置API Key
          await sendMessageToTabSafely(tab.id, {
            type: "SHOW_TRANSLATION_RESULT",
            error: "请先在选项页面设置百度AI的API Key。"
          });
          
          // 打开选项页
          chrome.runtime.openOptionsPage();
          return;
        }

        try {
          console.log("发送翻译请求 - 文本:", selectedText);
          console.log("使用API端点:", apiEndpoint);
          
          // 构建请求URL和请求体
          const requestUrl = apiEndpoint.endsWith('/') ? 
            `${apiEndpoint}chat/completions` : 
            `${apiEndpoint}/chat/completions`;
          
          const requestBody = {
            model: "ernie-4.5-turbo-32k",
            messages: [
              {
                role: "user",
                content: customPrompt + "," + selectedText + '怎么记住'
              }
            ],
            temperature: 0.8,
            top_p: 0.8,
            penalty_score: 1,
            web_search: {
              enable: true,
              enable_trace: false
            }
          };
          
          console.log("请求体:", JSON.stringify(requestBody));
          console.log("请求头包含Authorization头: Bearer " + (apiKey ? "***" + apiKey.substring(apiKey.length - 4) : "未设置"));
          
          // 发送翻译请求
          try {
            console.log("开始fetch请求...");
            const response = await fetch(requestUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(requestBody)
            });
            
            console.log("API响应状态:", response.status, response.statusText);
            
            const responseText = await response.text();
            console.log("API原始响应:", responseText);
            
            if (!response.ok) {
              throw new Error(`API请求失败: ${response.status} - ${response.statusText}. ${responseText}`);
            }
            
            // 解析JSON响应
            let data;
            try {
              data = JSON.parse(responseText);
              console.log("API返回结果(解析后):", JSON.stringify(data));
            } catch (parseError) {
              console.error("JSON解析错误:", parseError);
              throw new Error(`无法解析API响应: ${parseError.message}. 原始响应: ${responseText.substring(0, 100)}...`);
            }
            
            // 从响应中提取翻译结果，根据百度千帆API的实际返回格式
            const translation = data && data.choices && 
                               data.choices[0] && 
                               data.choices[0].message && 
                               data.choices[0].message.content || "";
            
            console.log("提取的翻译结果:", translation);

            if (translation) {
              // 发送翻译结果给内容脚本显示
              const sent = await sendMessageToTabSafely(tab.id, {
                type: "SHOW_TRANSLATION_RESULT",
                text: selectedText,
                translation: translation
              });
              
              if (sent) {
                // 存储查询历史
                saveToHistory(selectedText, translation);
              } else {
                console.log("无法显示翻译结果，可能标签页已关闭或导航至其他页面");
              }
            } else {
              throw new Error("未能获取翻译结果。返回数据格式可能不正确。");
            }
          } catch (fetchError) {
            console.error("fetch请求失败:", fetchError);
            
            // 尝试诊断失败原因
            let errorMessage = `翻译请求失败: ${fetchError.message}`;
            
            if (fetchError.message.includes('Failed to fetch')) {
              // 检查API端点格式
              if (!apiEndpoint.startsWith('http')) {
                errorMessage = `API端点格式错误: ${apiEndpoint}，应以http或https开头`;
              } else {
                errorMessage = "网络请求失败，可能原因：\n1. 网络连接问题\n2. 目标服务器无响应\n3. 跨域请求被阻止";
              }
            }
            
            throw new Error(errorMessage);
          }
        } catch (error) {
          console.error("翻译时发生错误:", error);
          await sendMessageToTabSafely(tab.id, {
            type: "SHOW_TRANSLATION_RESULT",
            error: `翻译失败: ${error.message}`
          });
        }
      });
    }
  }
});

// 保存查询历史
function saveToHistory(word, translation) {
  chrome.storage.local.get({ history: [] }, (result) => {
    const history = result.history;
    
    // 检查单词是否已存在于历史记录中
    const existingIndex = history.findIndex(item => item.word === word);
    
    if (existingIndex !== -1) {
      // 如果已存在，更新翻译，增加计数，添加新时间戳
      const existingEntry = history[existingIndex];
      existingEntry.translation = translation;
      existingEntry.repeatCount = (existingEntry.repeatCount || 1) + 1;
      
      // 如果没有timestamps数组，创建一个并加入原始时间戳
      if (!existingEntry.timestamps) {
        existingEntry.timestamps = [existingEntry.timestamp];
      }
      
      // 添加新的时间戳
      existingEntry.timestamps.push(new Date().toISOString());
      existingEntry.timestamp = new Date().toISOString(); // 更新最近查询时间
      
      // 将条目移到最前面
      history.splice(existingIndex, 1);
      history.unshift(existingEntry);
    } else {
      // 如果不存在，创建新条目
      const newEntry = {
        word: word,
        translation: translation,
        timestamp: new Date().toISOString(),
        repeatCount: 1,
        timestamps: [new Date().toISOString()]
      };
      history.unshift(newEntry); // 添加到数组开头
    }
    
    // 保留最近1000条
    if (history.length > 1000) {
      history.length = 1000;
    }
    chrome.storage.local.set({ history: history });
  });
}

// 监听来自popup或content script的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log("Background received message:", request, sender ? `from tab ${sender.tab?.id}` : "from extension");
  
  if (request.type === "GET_HISTORY") {
    chrome.storage.local.get({ history: [] }, (result) => {
      sendResponse({ history: result.history });
    });
    return true; // 异步响应
  }
  
  if (request.type === "CONTENT_SCRIPT_READY") {
    console.log("Content script is ready in tab:", sender.tab?.id);
    sendResponse({ received: true });
    return true;
  }

  if (request.type === "UPDATE_HISTORY") {
    if (request.history && Array.isArray(request.history)) {
      chrome.storage.local.set({ history: request.history }, () => {
        if (chrome.runtime.lastError) {
          console.error("Error saving updated history:", chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true });
        }
      });
    } else {
      sendResponse({ success: false, error: "Invalid history data provided." });
    }
    return true; // Asynchronous response
  }
  
  if (request.type === "TEST_API_CONNECTION") {
    const { apiKey, apiEndpoint } = request;
    
    // 测试API连接
    (async () => {
      try {
        // 构建测试请求URL
        const testRequestUrl = apiEndpoint || "https://qianfan.baidubce.com/v2/chat/completions";
        
        const testBody = {
          model: "ernie-4.5-turbo-32k",
          messages: [
            {
              role: "user",
              content: "Hello"
            }
          ],
          temperature: 0.8,
          top_p: 0.8,
          penalty_score: 1,
          web_search: {
            enable: true,
            enable_trace: false
          }
        };
        
        const response = await fetch(testRequestUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey || ''}`
          },
          body: JSON.stringify(testBody)
        });
        
        const responseText = await response.text();
        const success = response.ok;
        
        sendResponse({
          success: success,
          status: response.status,
          response: responseText,
          error: success ? null : "API请求失败: " + response.status + " " + response.statusText
        });
      } catch (error) {
        console.error("测试API连接失败:", error);
        sendResponse({
          success: false,
          error: error.message
        });
      }
    })();
    
    return true; // 异步响应
  }
});