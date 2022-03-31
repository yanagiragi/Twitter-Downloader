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
	constructor (account, credentials = null, verbose = true, EarlyBreakFunc = x => false, maxDepth = 1e9) {
		this.account = account
		this.credentials = Object.assign({ csrfToken: '', authToken: ''}, credentials)
		this.fetchResults = [] // container for fetched results
		this.fetchRetweets = [] // container for fetched retweets for detect duplicate cases
		this.EarlyBreak = EarlyBreakFunc
		this.maxDepth = maxDepth
		this.verbose = verbose

		this.bottomCursor = '' // stay null for the first time
		this.guestId = '' // update later
		this.restId = '' // update later

		// Not expose yet configs
		this.dataPerCount = 100
		this.debug = false 
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

		const query = `variables={
			"userId":${this.restId},
			"count":${this.dataPerCount}, 
			${(this.bottomCursor === '') ? '' : `"cursor":"${this.bottomCursor}",`}
			"includePromotedContent":true,
			"withQuickPromoteEligibilityTweetFields":true,
			"withSuperFollowsUserFields":true,
			"withDownvotePerspective":false,
			"withReactionsMetadata":false,
			"withReactionsPerspective":false,
			"withSuperFollowsTweetFields":true,
			"withVoice":true,"withV2Timeline":false,
			"__fs_interactive_text":false,
			"__fs_responsive_web_uc_gql_enabled":false,
			"__fs_dont_mention_me_view_api_enabled":false
		}`

		const uri = `https://twitter.com/i/api/graphql/NnaaAasMTEXwIY7b8BC7mg/UserTweets?${encodeURI(query)}`

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
		this.bottomCursor = this.GetCursor(data)

		/*if (typeof data.timeline === 'undefined') {
			console.log(`Error When Request ${uri}, probably due to rate limit`)
			console.log(data)
			console.log(this.guestId)
		}*/

		return data
	}

	Parse (data) {

		const GatherPhotos = tweet => {
			const photos = []
			const entryMedia = tweet?.legacy?.entities?.media
			if (entryMedia) {
				for (const media of entryMedia) {
					if (media?.type == 'photo') { // only save image instead of thumbnail of the video
						photos.push(`${media.media_url_https}:orig`)
					}
				}
			}
			return photos
		}

		const entries = this.GetEntries(data)
		const tweetEntries = entries.filter(this.IsTweet)

		const retweetContainer = []
		const tweetContainer = []
		for (const tweetEntry of tweetEntries) {
			const tweet = tweetEntry.content.itemContent.tweet_results.result
			const tweetId = tweet.rest_id
			const content = tweet.legacy.full_text
			const timestamp = tweet.legacy.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = GatherPhotos(tweet)

			if (this.IsRetweet(tweetEntry)) {
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
			console.log(`[${this.account}.CrawlFromMainPage] (${this.fetchResults.length}) <${results.length}, ${rawTweetResults.length}, ${retweetResults.length}, ${rawRetweetResults.length}>, depth = ${depth}, shouldBreak = ${shouldBreak}`)
		}
		
		if (this.debug) {
			console.log('')

			rawTweetResults.forEach(el => {
				console.log(`\t${el.tweetId}: ${el.content.substring(0, 20)} - ${el.timestamp}`)
			})

			console.log('---')

			rawRetweetResults.forEach(el => {
				console.log(`\t${el.tweetId}: ${el.content.substring(0, 20)} - ${el.timestamp}`)
			})

			console.log('')
		}

		if (shouldBreak === false && depth <= this.maxDepth) {
			return this.CrawlFromMainPage(depth + 1)
		} else {
			return [this.fetchResults, this.fetchRetweets]
		}
	}

	ParseSearchResult(searchResults) {

		const GatherPhotos = tweet => {
			const photos = []
			const entryMedia = tweet?.entities?.media
			if (entryMedia) {
				for (const media of entryMedia) {
					if (media?.type == 'photo') { // only save image instead of thumbnail of the video
						photos.push(`${media.media_url_https}:orig`)
					}
				}
			}
			return photos
		}

		const tweetContainer = []

		const tweetEntries = Object.values(searchResults.globalObjects.tweets)
		for (const tweetEntry of tweetEntries) {
			const tweetId = tweetEntry.id_str
			const content = tweetEntry.full_text
			const timestamp = tweetEntry.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = GatherPhotos(tweetEntry)
			tweetContainer.push(new TwitterTweet(tweetId, photos, timestamp, content))
		}

		return [tweetContainer, []]
	}

	// obsolete for now
	async CrawlFromAdvancedSearch (startDate, endDate, countPerRequest = 1000) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const q = `(from%3A${this.account})%20until%3A${endDate}%20since%3A${startDate}`
		const query = `include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_has_nft_avatar=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&include_ext_sensitive_media_warning=true&include_ext_trusted_friends_metadata=true&send_error_codes=true&simple_quoted_tweet=true&count=${this.dataPerCount}&query_source=typed_query&pc=1&spelling_corrections=1&ext=mediaStats%2ChighlightedLabel%2ChasNftAvatar%2CvoiceInfo%2Cenrichments%2CsuperFollowMetadata%2CunmentionInfo`

		const uri = `https://twitter.com/i/api/2/search/adaptive.json?${query}&q=${q}`

		const noLoginOptions = {
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

		const LoginOptions = {
			headers: {
				'User-Agent': UserAgent,
				'authorization': this.GetAuthorization(),
				'x-csrf-token': this.credentials.csrfToken,
				'Cookie': `ct0=${this.credentials.csrfToken};auth_token=${this.credentials.authToken}`
			},
		}

		let options = LoginOptions
		const isCredentialValid = 
			this.credentials?.csrfToken?.length == null ||
			this.credentials?.authToken?.length == null ||
			this.credentials?.authToken?.length == 0 ||
			this.credentials?.csrfToken?.length == 0
		if (isCredentialValid)
		{
			console.log('Detect user does not provide cookie, use incognito mode instead. (unable to fetch mature contents)')
			options = noLoginOptions
		}

		if (this.debug) {
			console.log(uri, options)
		}

		const resp = await fetch(uri, options)
		const raw = await resp.text()

		if (this.debug)
		{
			console.log(raw)
		}

		const data = JSON.parse(raw)

		if (data.errors && data.errors[0].message === 'Rate limit exceeded') {
			throw new Error('Rate limit exceeded')
		}
		
		const [rawTweetResults, rawRetweetResults] = this.ParseSearchResult(data)

		// Sometimes twitter returns duplicated results from different api calls
		// To deal with this, we filter the raw_results and leave only new TwitterTweets
		const isNotDuplicate = (ele, checkContainer) => {
			return checkContainer.length === 0 || checkContainer.filter(x => x.tweetId === ele.tweetId).length === 0
		}
		const results = rawTweetResults.filter(x => isNotDuplicate(x, this.fetchResults))
		const retweetResults = rawRetweetResults.filter(x => isNotDuplicate(x, this.fetchRetweets))

		return [results, retweetResults]
	}

	IsRetweet(entry) {
		return Boolean(entry?.content?.itemContent?.tweet_results?.result?.legacy?.retweeted_status_result)
	}

	IsTweet(entry) {
		return entry?.content?.itemContent?.itemType === 'TimelineTweet'
	}

	GetCursor (data) {
		const selector = entry => 
			entry?.content?.entryType === 'TimelineTimelineCursor' && entry?.content?.cursorType === 'Bottom'

		const entries = this.GetEntries(data)
		const cursors = entries.filter(selector)
		return cursors?.[0]?.content?.value
	}

	GetEntries (data) {
		return data.data.user.result.timeline.timeline.instructions.filter(x => x.type === 'TimelineAddEntries')[0].entries
	}
}

// Tests
if (require.main === module) {
	const account = 'HitenKei'
	const crawler = new TwitterCrawler(account, { csrfToken: '', authToken: '' }, true, () => false, 1)

	crawler.CrawlFromMainPage().then(result => {
		console.log('result = ', result)
		crawler.CrawlFromAdvancedSearch('2020-02-08', '2020-03-01').then(result => {
			console.log('result = ', result)
		})
	})
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler
