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
    constructor(account, startDate, endDate) {
        this.account = account
        this.startDate = startDate
        this.endDate = endDate
        this.fetchResults = []
        this.lang = 'en-us'
    }

    Fetch(position, depth=0) {
        // When depth is 0, which is our first fetch
        // Use min_position to get the lastest 5 tweets
        // Else, use max_position to get next 20 tweets
        let url = `https://twitter.com/i/search/timeline?vertical=default&q=from%3A${this.account}%20since%3A${this.startDate}%20until%3A${this.endDate}&src=typd&include_available_features=1&include_entities=1&lang=${this.lang}}&${depth == 0 ? 'min' : 'max'}_position=${position}`
        return requestPromise(url)
    }

    Parse(htmlString) {
        let data = JSON.parse(htmlString)    
        let position = data["max_position"];    
        if(!position) {
            position = data["min_position"]
        }
        
        let $ = cheerio.load(data['items_html'].replace(/\\\"/g,/\"/))
        let raw = $('.stream-item')

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
        return [position, container, data['items_html'].trim().length != 0]
    }
    
    // default position means nothing, just a placeholder
    // maxDepth < 0 means search until there is no data
    async Crawl (position='Haku_Is_Waifu', depth=0, maxDepth=-1) {    
        const requestResult = await this.Fetch(position, depth)
        const [nextPosition, resultIds, hasNext] = this.Parse(requestResult)

        resultIds.forEach(element => {
            this.fetchResults.push(element)
        });

        if (hasNext && maxDepth > 0 && depth <= maxDepth){
            return this.Crawl(nextPosition, depth + 1)
        }
        else {
            return this.fetchResults
        }
    }

}

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