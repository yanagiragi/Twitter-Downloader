const requestPromise = require('request-promise')
const cheerio = require('cheerio')

// options
let startDate = '2018-01-13'
let endDate = '2019-05-13'
let account = 'hmw59750476'

Crawl()

// default position means nothing, just a placeholder
async function Crawl (position = 'Haku_Is_Waifu', depth=0) {    
    const requestResult = await Fetch(position, depth)
    const [nextPosition, resultIds, hasNext] = Parse(requestResult)

    console.log([depth, nextPosition, hasNext, resultIds])
    if (hasNext && depth < 3){
        console.log('depth = ', depth)
        Crawl(nextPosition, depth + 1)
    }
}

function Fetch(position, depth=0){
    // When depth is 0, which is our first fetch
    // Use min_position to get the lastest 5 tweets
    // Else, use max_position to get next 20 tweets
    let url = `https://twitter.com/i/search/timeline?vertical=default&q=from%3A${account}%20since%3A${startDate}%20until%3A${endDate}&src=typd&include_available_features=1&include_entities=1&lang=zh-tw&${depth == 0 ? 'min' : 'max'}_position=${position}`
    return requestPromise(url)
}

function Parse(htmlString) {
    let data = JSON.parse(htmlString)    
    let position = data["max_position"];    
    if(!position){
        position = data["min_position"]
    }
    
    let $ = cheerio.load(data['items_html'].replace(/\\\"/g,/\"/))    
    let timestamps = $('.tweet-timestamp')
    
    let ids = []
    for(let i = 0; i < timestamps.length; ++i){
        ids.push(timestamps[i].attribs.href)
    }

    // format '/hmw59750476/status/1116955486270545920' to '1116955486270545920'
    ids = ids.map(x => x.substring(x.lastIndexOf('/')+1))

    // return nextPosition, resultIds, hasNext
    // remember to use trim(), since no data means data[items_html] is '\n\n\n\n\n\n\n \n'
    return [position, ids, data['items_html'].trim().length != 0]
}