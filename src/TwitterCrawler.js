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
    constructor(account, startDate, endDate, verbose=true, EarlyBreakFunc=(resultIds)=>false, maxDepth=1e9) {
        this.account = account
        this.startDate = startDate
        this.endDate = endDate
        this.fetchResults = []
        this.EarlyBreak = EarlyBreakFunc
        this.maxDepth = maxDepth
        this.verbose = verbose
        this.lang = 'us'
    }

    FetchFromMainPage(position, depth) {
        // When Depth is 0. we fetch origin search page for finding min_position start positions
        if(depth == 0) {
            let url = `https://twitter.com/${this.account}`
            return requestPromise(url)
        }
        else {
            let url = `https://twitter.com/i/profiles/show/${this.account}/timeline/tweets?include_available_features=1&include_entities=1&max_position=${position}&oldest_unread_id=0&reset_error_state=false`
            return requestPromise(url)
        }
    }

    FetchFromAdvancedSearch(position, depth) {
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
            let element = raw[i]
    
            // Special Cases: Retweeted Users also will get .stream-item class
            // Instead, we additonal check has .account class to verify it
            // e.g. https://twitter.com/pyon_Kti/status/943818655833341952 -> https://twitter.com/genkianamei/status/943818655833341952, appears when position = '965056919554596864'
            // e.g. https://twitter.com/pyon_Kti/status/959260348489523200 -> https://twitter.com/comicgrape/status/959260348489523200(NSFW!), appears when position = '945149415269871618'
            // note the below sections:
            // <div class="popup-tagged-users-list hidden"> 
            //      ...
            //      <li class="js-stream-item stream-item stream-item js-preexpanded preexpanded open" data-item-id="943818655833341952" id="stream-item-tweet-943818655833341952" data-item-type="tweet">
            //          <div class="account  js-actionable-user js-profile-popup-actionable " data-screen-name="cametek" data-user-id="70876713" data-name="かめりあ" data-emojified-name="" data-feedback-token="" data-impression-id="">
            //      ...
            // </div>
            let isRetweetAccount = $('.account', element) && $('.tweet', element).length == 0
            
            // check not only 'data-retweet-id' but also check 'data-permalink-path' since a user can retweets it's own tweet
            // e.g. https://twitter.com/pyon_Kti/status/1130285383286059008
            let isRetweetTweet = $('.tweet', element).length > 0 && 'data-retweet-id' in $('.tweet', element)[0].attribs && $('.tweet', element)[0].attribs['data-permalink-path'].indexOf(`/${this.account}/`) != 0
            
            if (isRetweetAccount || isRetweetTweet){
                
                // output retweet accounts for debugging
                // if (isRetweetAccount){
                //     console.log('tweetId (X) ', `https://twitter.com/${this.account}/status/${element.attribs['data-item-id']}`)
                // }
                continue
            }

            try {
                // format '/hmw59750476/status/1116955486270545920' to '1116955486270545920'
                let tweetId = $('.tweet-timestamp', element)[0].attribs.href
                tweetId = tweetId.substring(tweetId.lastIndexOf('/')+1)

                let timestamp = $('.tweet-timestamp', element)[0].attribs.title

                let rawPhotos = $('.js-adaptive-photo', element)
                let photos = []
                for(let j = 0; j < rawPhotos.length; ++j){
                    photos.push(`${rawPhotos[j].attribs['data-image-url']}:orig`)
                }

                container.push(new TwitterTweet(tweetId, photos, timestamp))           
            }
            catch(err)
            {
                console.log(`Error.`)
                console.log(element)
            }
        }

        // Debug Text
        // console.log(`${this.account} nextPosition = ${position}`)

        // return nextPosition, resultIds, hasNext
        // remember to use trim(), since no data means data[items_html] is '\n\n\n\n\n\n\n \n'
        let hasNext = depth == 0 || data['items_html'].trim().length != 0
        return [position, container, hasNext]
        
    }

    async CrawlFromMainPage(position='nothing', depth=0)
    {
        const requestResult = await this.FetchFromMainPage(position, depth)
        const [nextPosition, resultIds, hasNext] = this.Parse(requestResult, depth)

        resultIds.forEach(element => {
            this.fetchResults.push(element)
        });
        
        // pass params to callback provided from cli.js
        // the purpose is for caching the results for early breaking the recursively crawls
        let shouldBreak = this.EarlyBreak(this, resultIds)

        if(this.verbose)
            console.log(`[${this.account}.CrawlFromMainPage] depth = ${depth}, shouldBreak = ${shouldBreak}`)
            
        if (shouldBreak == false && hasNext && depth <= this.maxDepth) {
            return this.CrawlFromMainPage(nextPosition, depth + 1)
        }
        else {
            return this.fetchResults
        }
    }

    async CrawlFromAdvancedSearch(position='nothing', depth=0)
    {
        const requestResult = await this.FetchFromAdvancedSearch(position, depth)
        const [nextPosition, resultIds, hasNext] = this.Parse(requestResult, depth)

        resultIds.forEach(element => {
            this.fetchResults.push(element)
        });

        if(this.verbose)
            console.log(`[${this.account}.CrawlFromAdvancedSearch] depth = ${depth}`)

        if (hasNext && depth <= this.maxDepth) {
            return this.CrawlFromAdvancedSearch(nextPosition, depth + 1)
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
    let account = 'ZURIFFIN'    
    new TwitterCrawler(account,startDate,endDate, true,()=>false).CrawlFromMainPage().then(result => {
        console.log('result = ', result)
    })
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler
