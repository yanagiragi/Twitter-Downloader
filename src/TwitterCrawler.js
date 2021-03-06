const fetch = require('node-fetch')
const cheerio = require('cheerio')
const { string } = require('easy-table')

const UserAgent = 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:84.0) Gecko/20100101 Firefox/84.0'

class TwitterTweet {
	constructor (tweetId, photos, timestamp, content) {
		this.content = content
		this.tweetId = tweetId
		this.photos = photos
		this.timestamp = timestamp
		this.hasPhoto = photos.length > 0
	}
}

class TwitterCrawler {
	constructor (account, verbose = true, EarlyBreakFunc = x => false, maxDepth = 1e9) {
		this.account = account
		this.fetchResults = [] // container for fetched results
		this.fetchRetweets = [] // container for fetched retweets for detect duplicate cases
		this.EarlyBreak = EarlyBreakFunc
		this.maxDepth = maxDepth
		this.verbose = verbose

		this.bottomCursor = '' // stay null for the first time
		this.guestId = '' // update later
		this.restId = '' // update later

		// not expose yet.
		this.dataPerCount = 20
		this.includeReplies = true // since some user left the image in the replies, set to true instead
		this.debug = false
	}

	GetAuthorization () {
		return 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'
	}

	async GetGuestID () {
		if (this.guestId !== '') { return this.guestId }

		const uri = 'https://api.twitter.com/1.1/guest/activate.json'
		const resp = await fetch(uri, {
			method: 'POST',
			headers: {
				// 'User-Agent': UserAgent,
				// 'content-type': 'application/x-www-form-urlencoded',
				authorization: this.GetAuthorization()
			}
		})
		const data = await resp.text()

		if (this.isDebug) {
			console.log(data)
		}

		try {
			return JSON.parse(data).guest_token
		} catch (err) {
			throw new Error(`GetGuestID() of ${this.account} Error: ${err}`)
		}
	}

	async GetRestID () {
		const uri = `https://api.twitter.com/graphql/-xfUfZsnR_zqjFd-IfrN5A/UserByScreenName?variables=%7B%22screen_name%22%3A%22${this.account}%22%2C%22withHighlightedLabel%22%3Atrue%7D`
		const options = {
			headers: {
				'User-Agent': UserAgent,
				Accept: '*/*',
				'content-type': 'application/json',
				authorization: this.GetAuthorization(),
				'x-guest-token': this.GetGuestID()
			}
		}
		const resp = await fetch(uri, options)

		try {
			const data = await resp.json()
			const restId = data.data.user.rest_id
			return restId
		} catch (err) {
			throw new Error(`GetRestID() of ${this.account} Error: ${err}`)
		}
	}

	async FetchFromMainPage (position) {
		const uriBase = `https://api.twitter.com/2/timeline/profile/${this.restId}.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&send_error_codes=true&simple_quoted_tweet=true&count=${this.dataPerCount}&ext=mediaStats%2ChighlightedLabel%2CcameraMoment&include_quote_count=true&include_tweet_replies=${this.includeReplies.toString()}`

		const uri = uriBase + (this.bottomCursor === '' ? '' : `&cursor=${encodeURIComponent(this.bottomCursor)}&ext=mediaStats%2ChighlightedLabel%2CcameraMoment&include_quote_count=true`)

		const options = {
			headers: {
				'User-Agent': UserAgent,
				Accept: '*/*',
				'content-type': 'application/json',
				authorization: this.GetAuthorization(),
				'x-guest-token': this.guestId,
				'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
				'x-twitter-client-language': 'zh-tw',
				'x-twitter-active-user': 'yes',
				'x-csrf-token': '24e4afcba440e72020f828c5ce2482a9',
				Origin: 'https://twitter.com',
				DNT: 1,
				Connection: 'keep-alive',
				Referer: 'https://twitter.com/',
				Pragma: 'no-cache',
				'Cache-Control': 'no-cache',
				TE: 'Trailers'
			}
		}

		if (this.debug) {
			console.log(uri, options)
		}

		const resp = await fetch(uri, options)
		const data = await resp.json()

		const filterBottomCursor = x => x.content && x.content.operation && x.content.operation.cursor && x.content.operation.cursor.cursorType && x.content.operation.cursor.cursorType === 'Bottom'

		if (typeof data.timeline === 'undefined') {
			console.log(`Error When Request ${uri}, probably due to rate limit`)
			console.log(data)
			console.log(this.guestId)
		}

		// data.timeline.instructions[0] -> addEntries, data.timeline.instructions[1] -> pinEntry
		this.bottomCursor = data.timeline.instructions[0].addEntries.entries.filter(filterBottomCursor)[0].content.operation.cursor.value

		return data
	}

	async Preprocess () {
		// Get guestId (x-guest-token)
		if (this.guestId === '') {
			this.guestId = await this.GetGuestID()
		}

		// Get realId of this.account
		if (this.restId === '') {
			this.restId = await this.GetRestID()
		}
	}

	Parse (data) {
		const retweetContainer = []
		const tweetContainer = []
		for (const tweetEntry of Object.entries(data.globalObjects.tweets)) {
			const tweetId = tweetEntry[0]
			const tweet = tweetEntry[1]

			const content = tweet.full_text
			const timestamp = tweet.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = [] // container for image urls
			const entryMedia = tweet.entities.media
			if (entryMedia) {
				for (const media of entryMedia) {
					const url = `${media.media_url}:orig`

					// only save image instead of thumbnail of the video
					if (url.includes('ext_tw_video_thumb') === false) {
						photos.push(url)
					}
				}
			}

			if (tweet.retweeted_status_id_str !== undefined || tweet.user_id_str !== this.restId) {
				retweetContainer.push(new TwitterTweet(tweetId, photos, timestamp, content))
			} else {
				tweetContainer.push(new TwitterTweet(tweetId, photos, timestamp, content))
			}
		}
		return [tweetContainer, retweetContainer]
	}

	async CrawlFromMainPage (depth = 0) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const data = await this.FetchFromMainPage(depth)

		const [rawTweetResults, rawRetweetResults] = this.Parse(data)

		if (this.debug) {
			console.log(JSON.stringify(data))
		}

		// Sometimes twitter returns duplicated results from different api calls
		// To deal with this, we filter the raw_results and leave only new TwitterTweets
		const isNotDuplicate = (ele, checkContainer) => {
			return checkContainer.length === 0 || checkContainer.filter(x => x.tweetId === ele.tweetId).length === 0
		}
		const results = rawTweetResults.filter(x => isNotDuplicate(x, this.fetchResults))
		const retweetResults = rawRetweetResults.filter(x => isNotDuplicate(x, this.fetchRetweets))

		// store the crawled results
		results.forEach(element => this.fetchResults.push(element))
		retweetResults.forEach(element => this.fetchRetweets.push(element))

		// pass params to callback provided from cli.js
		// the purpose is for caching the results for early breaking the recursively crawls
		const shouldBreak = this.EarlyBreak(this, [results, retweetResults])

		// eslint-disable-next-line no-trailing-spaces
		if (this.verbose) { 
			console.log(`[${this.account}.CrawlFromMainPage] (${this.fetchResults.length}) <${results.length}, ${rawTweetResults.length}, ${rawRetweetResults.length}, ${retweetResults.length}>, depth = ${depth}, shouldBreak = ${shouldBreak}`)
		}

		if (shouldBreak === false && depth <= this.maxDepth) {
			return this.CrawlFromMainPage(depth + 1)
		} else {
			return [this.fetchResults, this.fetchRetweets]
		}
	}

	async CrawlFromAdvancedSearch (startDate, endDate, countPerRequest = 1000) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const uriBase = 'https://twitter.com/i/api/2/search/adaptive.json?include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&send_error_codes=true&simple_quoted_tweet=true&query_source=typed_query&pc=1&spelling_corrections=1&ext=mediaStats%2ChighlightedLabel'

		const query = `(from%3A${this.account})%20until%3A${endDate}%20since%3A${startDate}`
		const uri = `${uriBase}&count=${countPerRequest}&q=${query}`

		const options = {
			headers: {
				'User-Agent': UserAgent,
				Accept: '*/*',
				'content-type': 'application/json',
				authorization: this.GetAuthorization(),
				'x-guest-token': this.guestId,
				'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
				'x-twitter-client-language': 'zh-tw',
				'x-twitter-active-user': 'yes',
				'x-csrf-token': '24e4afcba440e72020f828c5ce2482a9',
				Origin: 'https://twitter.com',
				DNT: 1,
				Connection: 'keep-alive',
				Referer: 'https://twitter.com/',
				Pragma: 'no-cache',
				'Cache-Control': 'no-cache',
				TE: 'Trailers'
			}
		}

		const resp = await fetch(uri, options)
		const raw = await resp.text()
		const data = JSON.parse(raw)

		if (data.errors && data.errors[0].message === 'Rate limit exceeded') {
			throw new Error('Rate limit exceeded')
		}

		const [rawTweetResults, rawRetweetResults] = this.Parse(data)

		// Sometimes twitter returns duplicated results from different api calls
		// To deal with this, we filter the raw_results and leave only new TwitterTweets
		const isNotDuplicate = (ele, checkContainer) => {
			return checkContainer.length === 0 || checkContainer.filter(x => x.tweetId === ele.tweetId).length === 0
		}
		const results = rawTweetResults.filter(x => isNotDuplicate(x, this.fetchResults))
		const retweetResults = rawRetweetResults.filter(x => isNotDuplicate(x, this.fetchRetweets))

		return [results, retweetResults]
	}
}

// Tests
if (require.main === module) {
	const account = 'HitenKei'
	const crawler = new TwitterCrawler(account, true, () => false, 1)

	crawler.CrawlFromMainPage().then(result => {
		console.log('result = ', result)
		crawler.CrawlFromAdvancedSearch('2020-02-08', '2020-03-01').then(result => {
			console.log('result = ', result)
		})
	})
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler
