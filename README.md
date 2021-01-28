# Twitter-Downloader

## Descriptions

* 這是一個基於 Node.js 下載 Twitter 圖片的爬蟲工具

* ~~我們使用了 Twitter 進階搜尋 來迴避 Twitter API 有回傳數量限制的問題。~~

* ~~然而，Twitter 進階搜尋 的回傳資料並沒有很可靠，因此提供一個從主頁面爬取的方式 (有回傳數量限制)~~

* ~~因此建議是，如果你希望持續性的爬取資料(訂閱使用者)，你可能需要的是從主頁面爬取。如果你是想要拿到所有資料，請使用不太可靠的進階搜尋。~~

* ~~P.S. 目前僅實作 "爬取推文"，Retweet 是被排除的~~

(2020/06/03 Update)

* The project is done by calling twitter's API but without using official twitter API

* ~~Currently we only fetch tweets from timeline, fetch tweets from search will be done if the data integrity from timeline is poor. Howevers it seems to be fine for now~~

(2021/01/29 Update)

## How to use

* Clone or download the project, install package dependency via ```npm install``` when you are at the root folder of the project

* The users that need to be update are stored in bin/data/data.json, and the crawled tweets are stored in bin/data/container.json

* ```node bin/cli.js --mode mainInfo```: Update tweets based on Timeline (Waterfall on main page of twitter) 

    * [optional arguments] ```--sync true```: synchronize the crawling (To decrease the propability of acquiring rate limit, but cannot avoid rate limit)
    
    * [optional arguments] ```--deep true```: force update all tweet until no new results are passed back from the crawler

* ```node bin/cli.js --mode searchInfo```: Update tweets based on Advanced Search

   * [optional arguments] ```--sync true```: synchronize the crawling (To decrease the propability of acquiring rate limit, but cannot avoid rate limit)

* ```node bin/cli.js --mode image```: Download images in bin/data/container.json, the images is saved to bin/Storage/$ACCOUNT/

* ```node bin/cli.js --mode data --id $ID --createDate $CREATE_DATE```: Download images in bin/data/container.json, the images is saved to bin/Storage/$ID/

   * [optional arguments] ```--startDate $START_DATE```: Assign startDate, if not assign the default value is the $CREATE_DATE
   
   
* ```node bin/cli.js --mode clear```: Reset startDate to createDate for each user in bin/data/data.json
   
* ```node bin/cli.js --mode list```: Pretty print bin/data/data.json

## Format

* Config formats in bin/data/data.json

    ```
    [
        {
            "id": "hmw59750476",
            "createDate": "2019-5-14"
            "startDate": "2019-5-14",
            "ignore": true // optional field, to omit this user when crawling
        }
    ]

    ```

* Id represents the account of the user, createDate and startDate is date in format "YYYY-MM-DD"

* startDate represent last fetching time for mode "SearchInfo", so basically createDate should be constant but startDate changes by the program
