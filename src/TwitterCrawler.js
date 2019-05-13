const requestPromise = require('request-promise')
const cheerio = require('cheerio')

class TwitterTweet
{
    constructor(tweetId, photos, timestamp){
        this.tweetId = tweetId
        this.photos = photos
        this.timestamp = timestamp
        this.hasPhoto = photos.length > 0
    }
}

class TwitterCrawler
{
    constructor(account, startDate, endDate, maxDepth=1e9) {
        this.account = account
        this.startDate = startDate
        this.endDate = endDate
        this.fetchResults = []
        this.maxDepth = maxDepth
        this.lang = 'us'
    }

    Fetch(position, depth) {
        // When Depth is 0. we fetch origin search page for finding min_position start positions
        if(depth == 0) {
            let url = `https://twitter.com/search?l=&q=from%3A${this.account}%20since%3A${this.startDate}%20until%3A${this.endDate}&src=typd&lang=${this.lang}`
            return requestPromise(url)
        }
        else {
            let url = `https://twitter.com/i/search/timeline?vertical=default&q=from%3A${this.account}%20since%3A${this.startDate}%20until%3A${this.endDate}&src=typd&include_available_features=1&include_entities=1&lang=${this.lang}&reset_error_state=false&min_position=${position}`
            return requestPromise(url)
        }
        
    }

    Parse(htmlString, depth) {
        let $ = null
        let position = null
        let data = null

        // When Depth is 0. we fetch origin search page for finding min_position start positions
        if (depth == 0) {
            $ = cheerio.load(htmlString)
            position = $('.stream-container')

            if(position.length > 0){
                position = position[0].attribs['data-min-position']
            } 
            else {
                // Found no data
                return ['', [], false]
            }
        }
        else {
            data = JSON.parse(htmlString)    
            position = data["max_position"];    
            if(!position) {
                position = data["min_position"]
            }
            
            $ = cheerio.load(data['items_html'].replace(/\\\"/g,/\"/))            
        }

        let raw = $('.stream-item.js-stream-item')
        let container = []

        for(let i = 0; i < raw.length; ++i) {
            let data = raw[i]
            
            // format '/hmw59750476/status/1116955486270545920' to '1116955486270545920'
            let tweetId = $('.tweet-timestamp', data)[0].attribs.href
            tweetId = tweetId.substring(tweetId.lastIndexOf('/')+1)
            
            let timestamp = $('.tweet-timestamp', data)[0].attribs.title
            
            let rawPhotos = $('.js-adaptive-photo', data)
            let photos = []
            for(let j = 0; j < rawPhotos.length; ++j){
                photos.push(rawPhotos[j].attribs['data-image-url'])
            }
            
            container.push(new TwitterTweet(tweetId, photos, timestamp))
        }

        // return nextPosition, resultIds, hasNext
        // remember to use trim(), since no data means data[items_html] is '\n\n\n\n\n\n\n \n'
        let hasNext = depth == 0 || data['items_html'].trim().length != 0
        return [position, container, hasNext]
        
    }
    
    // default position means nothing, just a placeholder
    async Crawl (position='nothing', depth=0) {    
        const requestResult = await this.Fetch(position, depth)
        const [nextPosition, resultIds, hasNext] = this.Parse(requestResult, depth)

        resultIds.forEach(element => {
            this.fetchResults.push(element)
        });

        if (hasNext && depth <= this.maxDepth){
            return this.Crawl(nextPosition, depth + 1)
        }
        else {
            return this.fetchResults
        }
    }

}

// Tests
if (require.main === module) {
    let startDate = '2018-01-13'
    let endDate = '2019-05-13'
    let account = 'hmw59750476'    
    new TwitterCrawler(account,startDate,endDate).Crawl().then(result => {
        console.log('result = ', result)
    })
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler