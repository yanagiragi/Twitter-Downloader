# Twitter-Downloader

## Descriptions

* 這是一個基於 Node.js 但是不使用 Twitter API Lib 的 Twitter 的圖片下載工具

* The project is done by calling twitter's API but without using official twitter API

## How to use

* Clone or download the project, install package dependency via ```npm install``` when you are at the root folder of the project

* The users that need to be update are stored in bin/data/data.json, and the crawled tweets are stored in bin/data/container.json

## Preparations 

```
npm install
cp bin/data/templates/container.template.json bin/data/container.json
cp bin/data/templates/corrupted.template.json bin/data/corrupted.json
cp bin/data/templates/data.template.json bin/data/data.json
cp bin/data/templates/processed.template.json bin/data/processed.json
cp bin/data/templates/skip.template.json bin/data/skip.json
```

## Command - Download

* ```node bin/cli.js --mode mainInfo```: Update tweets based on Timeline (Waterfall on main page of twitter) 

* ```node bin/cli.js --mode searchInfo```: Update tweets based on Advanced Search

* ```node bin/cli.js --mode image```: Download images in bin/data/container.json, the images is saved to bin/Storage/$ACCOUNT/

## Command - Download (Optional Arguments)

* ```--sync true```: synchronize the crawling (To decrease the propability of acquiring rate limit, but cannot avoid rate limit)

* ```--deep true```: WIP

* ```--useRemoteStorage true```: WIP

* ```--useProcessJson true```: WIP


## Command - Edit Configs

* ```node bin/cli.js --mode data --id $ID --createDate $CREATE_DATE```: Download images in bin/data/container.json, the images is saved to bin/Storage/$ID/

   * [optional arguments] ```--startDate $START_DATE```: Assign startDate, if not assign the default value is the $CREATE_DATE
   
* ```node bin/cli.js --mode clear```: Reset startDate to createDate for each user in bin/data/data.json
   
* ```node bin/cli.js --mode list```: Pretty print bin/data/data.json

## Format (WIP)

* Configs Details
  * data.json
  * container.json
  * processed.json
  * skip.json  
  * corrupted.json 

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
