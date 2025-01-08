// ==UserScript==
// @name         GitHub 繁體中文化
// @namespace    https://github.com/LaiYueTing/GitHub-zh_TW
// @description  繁體中文化 GitHub 介面的部分選單及內容。
// @copyright    2025, LaiYueTing (https://github.com/LaiYueTing)
// @icon         https://github.githubassets.com/pinned-octocat.svg
// @version      1.9.3
// @author       LaiYueTing
// @license      GPL-3.0
// @match        https://github.com/*
// @match        https://skills.github.com/*
// @match        https://gist.github.com/*
// @match        https://education.github.com/*
// @match        https://www.githubstatus.com/*
// @require      https://raw.githubusercontent.com/LaiYueTing/GitHub-zh_TW/main/locals.js?v1.9.3
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_notification
// @connect      fanyi.iflyrec.com
// @supportURL   https://github.com/LaiYueTing/Github-zh_TW/issues
// ==/UserScript==

(function (window, document, undefined) {
    'use strict';

    const lang = 'zh-TW'; // 設定預設語言
    let enable_RegExp = GM_getValue("enable_RegExp", 1),
        page = false,
        cachedPage = null,
        characterData = null,
        ignoreMutationSelectors = [],
        ignoreSelectors = [],
        tranSelectors = [],
        regexpRules = [];

    function updateConfig(page) {
        if (cachedPage !== page && page) {
            cachedPage = page;

            const { characterDataPage, ignoreMutationSelectorPage, ignoreSelectorPage } = I18N.conf;
            characterData = characterDataPage.includes(page);
            // 忽略突變元素選擇器
            ignoreMutationSelectors = ignoreMutationSelectorPage['*'].concat(ignoreMutationSelectorPage[page] || []);
            // 忽略元素選擇器
            ignoreSelectors = ignoreSelectorPage['*'].concat(ignoreSelectorPage[page] || []);
            // 透過 CSS 選擇器翻譯的規則
            tranSelectors = (I18N[lang][page]?.selector || []).concat(I18N[lang]['public'].selector || []);
            // 正規表達式詞條
            regexpRules = (I18N[lang][page].regexp || []).concat(I18N[lang]['public'].regexp || []);
        }
    }

    function initPage() {
        const page = getPage();
        updateConfig(page);
        return page;
    }

    /**
     * watchUpdate 函式：監視頁面變化，根據變化的節點進行翻譯
     */
    function watchUpdate() {
        // 檢測瀏覽器是否支援 MutationObserver
        const MutationObserver =
            window.MutationObserver ||
            window.WebKitMutationObserver ||
            window.MozMutationObserver;

        // 快取目前頁面的 URL
        let previousURL = location.href;

        // 監聽 document.body 下 DOM 變化，用於處理節點變化
        new MutationObserver(mutations => {
            const currentURL = location.href;

            // 如果頁面的 URL 發生變化
            if (currentURL !== previousURL) {
                previousURL = currentURL;
                page = initPage();
                console.log(`DOM 變化觸發: 連結變化 Page = ${page}`);
            }

            if (page) {

                // 使用 mutations.flatMap 進行篩選突變:
                //   1. 針對 `節點增加` 突變，後期疊代翻譯的對象調整為 `addedNodes` 中記錄的新增節點，而不是 `target`，此舉大幅減少重複疊代翻譯
                //   2. 對於其他 `屬性` 和特定頁面 `文字節點` 突變，仍舊直接處理 `target`
                //   3. 使用 `nodes.filter()` 篩選丟棄特定頁面 `特定忽略元素` 內突變的節點
                const filteredMutations = mutations.flatMap(({ target, addedNodes, type }) => {
                    let nodes = [];
                    if (type === 'childList' && addedNodes.length > 0) {
                        nodes = Array.from(addedNodes); // 將新增節點轉換為數組
                    } else if (type === 'attributes' || (characterData && type === 'characterData')) {
                        nodes = [target]; // 否則，僅處理目標節點
                    }

                    // 對每個節點進行篩選，忽略特定選擇器
                    return nodes.filter(node =>
                        !ignoreMutationSelectors.some(selector => node.parentElement?.closest(selector))
                    );
                });

                // 處理每個變化
                filteredMutations.forEach(node => traverseNode(node));
            }
        }).observe(document.body, {
            characterData: true,
            subtree: true,
            childList: true,
            attributeFilter: ['value', 'placeholder', 'aria-label', 'data-confirm'], // 僅觀察特定屬性變化
        });
    }

    /**
     * traverseNode 函式：遍歷指定的節點，並對節點進行翻譯。
     * @param {Node} node - 需要遍歷的節點。
     */
    function traverseNode(node) {
        // 跳過忽略的節點
        const skipNode = node => ignoreSelectors.some(selector => node.matches?.(selector));
        if (skipNode(node)) return;

        if (node.nodeType === Node.ELEMENT_NODE) { // 元素節點處理

            // 處理不同標籤的元素屬性翻譯
            switch (node.tagName) {
                case "RELATIVE-TIME": // 翻譯時間元素
                    transTimeElement(node.shadowRoot);
                    watchTimeElement(node.shadowRoot);
                    return;

                case "INPUT":
                case "TEXTAREA": // 輸入框 按鈕 文字域
                    if (['button', 'submit', 'reset'].includes(node.type)) {
                        transElement(node.dataset, 'confirm'); // 翻譯 瀏覽器 提示對話框
                        transElement(node, 'value');
                    } else {
                        transElement(node, 'placeholder');
                    }
                    break;

                case "BUTTON":
                    if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel'); // 翻譯 瀏覽器 提示對話框
                    transElement(node, 'title'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirm'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirmText'); // 翻譯 瀏覽器 提示對話框
                    transElement(node.dataset, 'confirmCancelText'); // 取消按鈕 提醒
                    transElement(node, 'cancelConfirmText'); // 取消按鈕 提醒
                    transElement(node.dataset, 'disableWith'); // 按鈕等待提示
                    break;

                case "OPTGROUP":
                    transElement(node, 'label'); // 翻譯 <optgroup> 的 label 屬性
                    break;

                case "A":
                    transElement(node, 'title'); // title 屬性
                    break;

                case "SPAN":
                    transElement(node, 'title'); // title 屬性
                    transElement(node, 'ariaLabel');
                    break;

                default:
                    // 僅當 元素存在 'tooltipped' 樣式 aria-label 才起效果
                    if (/tooltipped/.test(node.className)) transElement(node, 'ariaLabel'); // 帶提示的元素，類似 tooltip 效果的
            }

            node.childNodes.forEach(child => traverseNode(child)); // 遍歷子節點

        } else if (node.nodeType === Node.TEXT_NODE && node.length <= 500) { // 文字節點且長度小於等於 500
            transElement(node, 'data');
        }
    }

    /**
     * getPage 函式：取得頁面的類型。
     * @param {URL object} URL - 需要分析的 URL。
     * @returns {string|boolean} 頁面的類型，如果無法確定類型，那麼回傳 false。
     */
    function getPage(url = window.location) {
        // 站點映射
        const siteMapping = {
            'gist.github.com': 'gist',
            'www.githubstatus.com': 'status',
            'skills.github.com': 'skills',
            'education.github.com': 'education',
        };
        const site = siteMapping[url.hostname] || 'github';
        const pathname = url.pathname;

        // 是否登入
        const isLogin = document.body.classList.contains("logged-in");
        // 取得 analytics-location
        const analyticsLocation = document.head.querySelector('meta[name="analytics-location"]')?.content || '';

        // 判斷頁面類型
        const isOrganization = /\/<org-login>/.test(analyticsLocation) || /^\/(?:orgs|organizations)/.test(pathname);
        const isRepository = /\/<user-name>\/<repo-name>/.test(analyticsLocation);
        const isProfile = document.body.classList.contains("page-profile") || analyticsLocation === '/<user-name>';
        const isSession = document.body.classList.contains("session-authentication");

        const { rePagePathRepo, rePagePathOrg, rePagePath } = I18N.conf;
        let t, page = false;

        if (isSession) {
            page = 'session-authentication';
        } else if (site === 'gist' || site === 'status' || site === 'skills' || site === 'education') {
            page = site;
        } else if (isProfile) {
            t = url.search.match(/tab=([^&]+)/);
            page = t ? 'page-profile/' + t[1] : pathname.includes('/stars') ? 'page-profile/stars' : 'page-profile';
        } else if (pathname === '/' && site === 'github') {
            page = isLogin ? 'page-dashboard' : 'homepage';
        } else if (isRepository) {
            t = pathname.match(rePagePathRepo);
            page = t ? 'repository/' + t[1] : 'repository';
        } else if (isOrganization) {
            t = pathname.match(rePagePathOrg);
            page = t ? 'orgs/' + (t[1] || t.slice(-1)[0]) : 'orgs';
        } else {
            t = pathname.match(rePagePath);
            page = t ? (t[1] || t.slice(-1)[0]) : false;
        }

        if (!page || !I18N[lang][page]) {
            console.log(`請注意對應 Page ${page} 詞庫節點不存在`);
            page = false;
        }
        return page;
    }

    /**
     * transTitle 函式：翻譯頁面標題
     */
    function transTitle() {
        const text = document.title; // 取得標題文字內容
        let translatedText = I18N[lang]['title']['static'][text] || '';
        if (!translatedText) {
            const res = I18N[lang]['title'].regexp || [];
            for (let [a, b] of res) {
                translatedText = text.replace(a, b);
                if (translatedText !== text) break;
            }
        }
        document.title = translatedText;
    }

    /**
     * transTimeElement 函式：翻譯時間元素文字內容。
     * @param {Element} el - 需要翻譯的元素。
     */
    function transTimeElement(el) {
        const text = el.childNodes.length > 0 ? el.lastChild.textContent : el.textContent;
        const translatedText = text.replace(/^on/, "");
        if (translatedText !== text) {
            el.textContent = translatedText;
        }
    }

    /**
     * watchTimeElement 函式：監視時間元素變化, 觸發和呼叫時間元素翻譯
     * @param {Element} el - 需要監視的元素。
     */
    function watchTimeElement(el) {
        const MutationObserver =
            window.MutationObserver ||
            window.WebKitMutationObserver ||
            window.MozMutationObserver;

        new MutationObserver(mutations => {
            transTimeElement(mutations[0].addedNodes[0]);
        }).observe(el, {
            childList: true
        });
    }

    /**
     * transElement 函式：翻譯指定元素的文字內容或屬性。
     * @param {Element|DOMStringMap} el - 需要翻譯的元素或元素的資料集 (node.dataset)。
     * @param {string} field - 需要翻譯的屬性名稱或文字內容欄位。
     */
    function transElement(el, field) {
        const text = el[field]; // 取得需要翻譯的文字
        if (!text) return false; // 當 text 為空時，退出函式

        const translatedText = transText(text); // 翻譯後的文字
        if (translatedText) {
            el[field] = translatedText; // 替換翻譯後的內容
        }
    }

    /**
     * transText 函式：翻譯文字內容。
     * @param {string} text - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function transText(text) {
        // 判斷是否需要跳過翻譯
        //  1. 檢查內容是否為空或者僅包含空白字元或數字。
        //  2. 檢查內容是否僅包含中文字符。
        //  3. 檢查內容是否不包含英文字母和符號。
        const shouldSkip = text => /^[\s0-9]*$/.test(text) || /^[\u4e00-\u9fa5]+$/.test(text) || !/[a-zA-Z,.]/.test(text);
        if (shouldSkip(text)) return false;

        // 清理文字內容
        const trimmedText = text.trim(); // 去除首尾空格
        const cleanedText = trimmedText.replace(/\xa0|[\s]+/g, ' '); // 去除多餘空白字元（包括 &nbsp; 空格 換行符）

        // 嘗試取得翻譯結果
        const translatedText = fetchTranslatedText(cleanedText);

        // 如果找到翻譯並且不與清理後的文字相同，則回傳替換後的結果
        if (translatedText && translatedText !== cleanedText) {
            return text.replace(trimmedText, translatedText); // 替換原字元，保留首尾空白部分
        }

        return false;
    }

    /**
     * fetchTranslatedText 函式：從特定頁面的詞庫中獲得翻譯文字內容。
     * @param {string} text - 需要翻譯的文字內容。
     * @returns {string|boolean} 翻譯後的文字內容，如果沒有找到對應的翻譯，那麼回傳 false。
     */
    function fetchTranslatedText(text) {

        // 靜態翻譯
        let translatedText = I18N[lang][page]['static'][text] || I18N[lang]['public']['static'][text]; // 預設翻譯 公共部分

        if (typeof translatedText === 'string') {
            return translatedText;
        }

        // 正規表達式翻譯
        if (enable_RegExp) {
            for (let [a, b] of regexpRules) {
                translatedText = text.replace(a, b);
                if (translatedText !== text) {
                    return translatedText;
                }
            }
        }

        return false; // 沒有翻譯條目
    }

    /**
     * transDesc 函式：為指定的元素新增一個翻譯按鈕，並為該按鈕新增點擊事件。
     * @param {string} selector - CSS選擇器，用於選擇需要新增翻譯按鈕的元素。
     */
    function transDesc(selector) {
        // 使用 CSS 選擇器選擇元素
        const element = document.querySelector(selector);

        // 如果元素不存在 或者 translate-me 元素已存在，那麼直接回傳
        if (!element || document.getElementById('translate-me')) return false;

        // 在元素後面插入一個翻譯按鈕
        const buttonHTML = `<div id='translate-me' style='color: rgb(27, 149, 224); font-size: small; cursor: pointer'>翻譯</div>`;
        element.insertAdjacentHTML('afterend', buttonHTML);
        const button = element.nextSibling;

        // 為翻譯按鈕新增點擊事件
        button.addEventListener('click', () => {
            // 取得元素的文字內容
            const descText = element.textContent.trim();

            // 如果文字內容為空，那麼直接回傳
            if (!descText) return false;

            // 呼叫 transDescText 函式進行翻譯
            transDescText(descText, translatedText => {
                // 翻譯完成後，隱藏翻譯按鈕，並在元素後面插入翻譯結果
                button.style.display = "none";
                const translatedHTML = `<span style='font-size: small'>翻譯👇</span><br/>${translatedText}`;
                element.insertAdjacentHTML('afterend', translatedHTML);
            });
        });
    }

    /**
     * transDescText 函式：將指定的文字發送到訊飛的翻譯服務進行翻譯。
     * @param {string} text - 需要翻譯的文字。
     * @param {function} callback - 翻譯完成後的回調函式，該函式接受一個參數，即翻譯後的文字。
     */
    function transDescText(text, callback) {
        // 使用 GM_xmlhttpRequest 函式發送 HTTP 請求
        GM_xmlhttpRequest({
            method: "POST", // 請求方法為 POST
            url: "https://fanyi.iflyrec.com/TJHZTranslationService/v2/textAutoTranslation", // 請求的 URL
            headers: { // 請求標頭
                'Content-Type': 'application/json',
                'Origin': 'https://fanyi.iflyrec.com',
            },
            data: JSON.stringify({
                "from": 2,
                "to": 1,
                "type": 1,
                "contents": [{
                    "text": text
                }]
            }), // 請求的資料
            responseType: "json", // 響應的資料類型為 JSON
            onload: (res) => {
                try {
                    const { status, response } = res;
                    const translatedText = (status === 200) ? response.biz[0].sectionResult[0].dst : "翻譯失敗";
                    callback(translatedText);
                } catch (error) {
                    console.error('翻譯失敗', error);
                    callback("翻譯失敗");
                }
            },
            onerror: (error) => {
                console.error('網路請求失敗', error);
                callback("網路請求失敗");
            }
        });
    }

    /**
     * transBySelector 函式：透過 CSS 選擇器找到頁面上的元素，並將其文字內容替換為預定義的翻譯。
     */
    function transBySelector() {
        if (tranSelectors.length > 0) {
            // 遍歷每個翻譯規則
            for (let [selector, translatedText] of tranSelectors) {
                // 使用 CSS 選擇器找到對應的元素
                const element = document.querySelector(selector);
                // 如果找到了元素，那麼將其文字內容替換為翻譯後的文字
                if (element) {
                    element.textContent = translatedText;
                }
            }
        }
    }

    /**
     * registerMenuCommand 函式：註冊選單。
     */
    function registerMenuCommand() {
        const toggleRegExp = () => {
            enable_RegExp = !enable_RegExp;
            GM_setValue("enable_RegExp", enable_RegExp);
            GM_notification(`已${enable_RegExp ? '開啟' : '關閉'}正規表達式功能`);
            if (enable_RegExp) {
                location.reload();
            }
            GM_unregisterMenuCommand(id);
            id = GM_registerMenuCommand(`${enable_RegExp ? '關閉' : '開啟'}正規表達式功能`, toggleRegExp);
        };

        let id = GM_registerMenuCommand(`${enable_RegExp ? '關閉' : '開啟'}正規表達式功能`, toggleRegExp);
    }

    /**
     * init 函式：初始化翻譯功能。
     */
    function init() {
        // 取得目前頁面的翻譯規則
        page = initPage();
        console.log(`開始 Page = ${page}`);

        if (page) traverseNode(document.body);

        // 監視頁面變化
        watchUpdate();
    }

    // 設定中文環境
    document.documentElement.lang = lang;

    // 監測 HTML Lang 值, 設定中文環境
    new MutationObserver(mutations => {
        if (document.documentElement.lang === "en") {
            document.documentElement.lang = lang;
        }
    }).observe(document.documentElement, {
        attributeFilter: ['lang']
    });

    // 監聽 Turbo 完成事件
    document.addEventListener('turbo:load', () => {
        if (page) {
            transTitle(); // 翻譯頁面標題
            transBySelector();
            if (page === "repository") { // 倉庫簡介翻譯
                transDesc(".f4.my-3");
            } else if (page === "gist") { // Gist 簡介翻譯
                transDesc(".gist-content [itemprop='about']");
            }
        }
    });

    // 初始化選單
    registerMenuCommand();

    // 在頁面初始載入完成時執行
    window.addEventListener('DOMContentLoaded', init);

})(window, document);
