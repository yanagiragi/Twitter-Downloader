# Twitter-Downloader

## 說明

* 這是一個基於 Node.js 下載 Twitter 圖片的爬蟲工具

* 我們使用了 Twitter 進階搜尋 來迴避 Twitter API 有回傳數量限制的問題。

## 設定檔格式

* 以下是 data.template.json 的示範

    ```
    [
        {
            "id": "hmw59750476",
            "startDate": "2019-5-14"
        },
        {
            "id": "pyon_Kti",
            "startDate": "2019-5-14"
        }
    ]

    ```

* Id 代表使用者的帳號, startDate 代表要開始搜尋的日期 (請參考 [細部參數調整](#細部參數調整))

* 不確定要填寫哪個日期的話，建議填這個日期的"前幾天" 

    ![](https://i.imgur.com/FnvD6F9.png)

* 每爬過一些資訊 (請參考 [細部參數調整](#細部參數調整))，即會存檔一次。每次存檔都會更新 startDate 為最後一次搜尋的時間

## 使用方式

WIP

## 細部參數調整

* 現階段可以調整的參數為

    ```
    // 一次要跳過多少天
    const daySkip = 7
    
    // 多少筆資訊自動儲存一次
    const saveDuration = 50
    ```

* 我們使用了 Twitter 進階搜尋，因此使用者必須設定要搜尋的時間區間。

    * 設定的搜尋區間為 startDate ~ startDate + daySkip 天，接著 startDate 更新成 startDate + daySkip 繼續迭代

    * 例如 daySkip 為七天，代表我們每七天丟一次 twitter 進階搜尋

    * daySkip 可以視同類似包成 batch 一起搜尋，注意如果 twitter 進階搜尋 結果超過上限 (約5000 筆)，可能會導致資料不完全的問題