const fetch = require('node-fetch')
const cheerio = require('cheerio')
const { string } = require('easy-table')

const UserAgent = 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:84.0) Gecko/20100101 Firefox/84.0'

const defaulfCsrfToken = 'a1f272646de62b7f37cf2104814fceab'

class TwitterTweet {
	constructor(tweetId, photos, timestamp, content, isSensitive) {
		this.content = content
		this.tweetId = tweetId
		this.photos = photos
		this.timestamp = timestamp
		this.hasPhoto = photos.length > 0
		this.isSensitive = isSensitive
	}
}

class TwitterCrawler {
	constructor(account, credentials = null, verbose = true, EarlyBreakFunc = x => false, maxDepth = 1e9) {
		this.account = account
		this.credentials = Object.assign({ csrfToken: '', authToken: '' }, credentials)
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

	async Preprocess() {

		// Get Authorization token, constant for now
		this.authorization = 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA'

		// Get guestId (x-guest-token)
		if (this.guestId === '') {
			this.guestId = await this.GetGuestID()
		}

		// Get realId of this.account
		if (this.restId === '') {
			this.restId = await this.GetRestID()
		}
	}

	async GetGuestID() {
		const uri = 'https://api.twitter.com/1.1/guest/activate.json'
		const resp = await fetch(uri, {
			method: 'POST',
			headers: {
				// 'User-Agent': UserAgent,
				// 'content-type': 'application/x-www-form-urlencoded',
				authorization: this.authorization
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

	async GetRestID() {
		const uri = `https://api.twitter.com/graphql/-xfUfZsnR_zqjFd-IfrN5A/UserByScreenName?variables=%7B%22screen_name%22%3A%22${this.account}%22%2C%22withHighlightedLabel%22%3Atrue%7D`
		const options = {
			headers: {
				'User-Agent': UserAgent,
				'Accept': '*/*',
				'content-type': 'application/json',
				'authorization': this.authorization,
				'x-guest-token': this.guestId
			}
		}

		const resp = await fetch(uri, options)
		const raw = await resp.text()

		try {
			const data = JSON.parse(raw)
			const restId = data.data.user.rest_id
			return restId
		} catch (err) {
			throw new Error(`GetRestID() of ${this.account} Error: ${err}, Raw = ${raw}`)
		}
	}

	async FetchFromMainPage(position) {

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

		const options = this.GetOptions()

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

	GatherPhotos(tweet) {
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

	ParseMainPageResult(data) {

		const entries = this.GetEntries(data)
		const tweetEntries = entries
			.filter(this.IsTweetEntry)
			.map(this.GetTweetsFromTweetEntries)
			.flat()

		const retweetContainer = []
		const tweetContainer = []
		for (const tweet of tweetEntries) {
			const tweetId = tweet.rest_id
			const content = tweet.legacy.full_text
			const timestamp = tweet.legacy.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = this.GatherPhotos(tweet)
			const isSensitive = this.IsSensitiveContent(tweet)
			const twitterTweet = new TwitterTweet(tweetId, photos, timestamp, content, isSensitive)
			if (this.IsRetweet(tweet)) {
				retweetContainer.push(twitterTweet)
			} else {
				tweetContainer.push(twitterTweet)
			}
		}

		return [tweetContainer, retweetContainer]
	}

	async CrawlFromMainPage(depth = 0) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const data = await this.FetchFromMainPage(depth)

		const [rawTweetResults, rawRetweetResults] = this.ParseMainPageResult(data)

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

		const tweetContainer = []

		const tweetEntries = Object.values(searchResults.globalObjects.tweets)
		for (const tweetEntry of tweetEntries) {
			const tweetId = tweetEntry.id_str
			const content = tweetEntry.full_text
			const timestamp = tweetEntry.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = this.GatherPhotos(tweetEntry)
			const isSensitive = this.IsSensitiveContent(tweetEntry)
			tweetContainer.push(new TwitterTweet(tweetId, photos, timestamp, content, isSensitive))
		}

		return [tweetContainer, []]
	}

	async FetchFromTweet(tweetId) {

		await this.Preprocess()

		const query = `{"focalTweetId":"${tweetId}","with_rux_injections":false,"includePromotedContent":true,"withCommunity":true,"withQuickPromoteEligibilityTweetFields":true,"withBirdwatchNotes":false,"withSuperFollowsUserFields":true,"withDownvotePerspective":false,"withReactionsMetadata":false,"withReactionsPerspective":false,"withSuperFollowsTweetFields":true,"withVoice":true,"withV2Timeline":true}&features={"verified_phone_label_enabled":false,"responsive_web_graphql_timeline_navigation_enabled":true,"unified_cards_ad_metadata_container_dynamic_card_content_query_enabled":true,"tweetypie_unmention_optimization_enabled":true,"responsive_web_uc_gql_enabled":true,"vibe_api_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":false,"interactive_text_enabled":true,"responsive_web_text_conversations_enabled":false,"responsive_web_enhance_cards_enabled":true}`

		const options = this.GetOptions()

		const resp = await fetch(`https://twitter.com/i/api/graphql/lwMlLKa0uCr-By_siQJaGQ/TweetDetail?variables=${encodeURI(query)}`, options)
		const raw = await resp.json()

		const entries = raw?.data?.threaded_conversation_with_injections_v2?.instructions?.[0]?.entries
		const tweet = this.GetTweetsFromTweetEntries(entries)?.[0]

		const content = tweet?.legacy?.full_text
		const timestamp = tweet?.legacy?.created_at // e.g. Sun May 31 02:40:23 +0000 2020
		const photos = this.GatherPhotos(tweet)
		const isSensitive = this.IsSensitiveContent(tweet)

		return new TwitterTweet(tweetId, photos, timestamp, content, isSensitive)
	}

	GetOptions(useNoLogin = false) {
		const noLoginOptions = {
			headers: {
				'User-Agent': UserAgent,
				Accept: '*/*',
				'content-type': 'application/json',
				authorization: this.authorization,
				'x-guest-token': this.guestId,
				'Accept-Language': 'zh-TW,zh;q=0.8,en-US;q=0.5,en;q=0.3',
				'x-twitter-client-language': 'zh-tw',
				'x-twitter-active-user': 'yes',
				'x-csrf-token': defaulfCsrfToken,
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
				'authorization': this.authorization,
				'x-csrf-token': this.credentials.csrfToken,
				'Cookie': `ct0=${this.credentials.csrfToken};auth_token=${this.credentials.authToken}`
			},
		}

		if (useNoLogin) {
			return noLoginOptions
		}

		let options = LoginOptions
		const isCredentialValid =
			this.credentials?.csrfToken?.length == null ||
			this.credentials?.authToken?.length == null ||
			this.credentials?.authToken?.length == 0 ||
			this.credentials?.csrfToken?.length == 0
		if (isCredentialValid) {
			console.log('Detect user does not provide cookie, use incognito mode instead. (unable to fetch mature contents)')
			options = noLoginOptions
		}

		return options
	}

	async CrawlFromAdvancedSearch(startDate, endDate, countPerRequest = 1000) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const q = `(from%3A${this.account})%20until%3A${endDate}%20since%3A${startDate}`
		const query = `include_profile_interstitial_type=1&include_blocking=1&include_blocked_by=1&include_followed_by=1&include_want_retweets=1&include_mute_edge=1&include_can_dm=1&include_can_media_tag=1&include_ext_has_nft_avatar=1&skip_status=1&cards_platform=Web-12&include_cards=1&include_ext_alt_text=true&include_quote_count=true&include_reply_count=1&tweet_mode=extended&include_entities=true&include_user_entities=true&include_ext_media_color=true&include_ext_media_availability=true&include_ext_sensitive_media_warning=true&include_ext_trusted_friends_metadata=true&send_error_codes=true&simple_quoted_tweet=true&count=${this.dataPerCount}&query_source=typed_query&pc=1&spelling_corrections=1&ext=mediaStats%2ChighlightedLabel%2ChasNftAvatar%2CvoiceInfo%2Cenrichments%2CsuperFollowMetadata%2CunmentionInfo`

		const uri = `https://twitter.com/i/api/2/search/adaptive.json?${query}&q=${q}`
		let options = this.GetOptions()

		if (this.debug) {
			console.log(uri, options)
		}

		const resp = await fetch(uri, options)
		const raw = await resp.text()

		if (this.debug) {
			console.log(raw)
		}

		const data = JSON.parse(raw)

		if (data.errors) {
			const errorMessage = data.errors[0].message
			if (errorMessage === 'Rate limit exceeded') {
				throw new Error('Rate limit exceeded')
			}
			else if (errorMessage === 'Forbidden.') {
				throw new Error('Forbidden')
			}
			else if (errorMessage.includes('temporarily locked')) {
				throw new Error('Account temporarily locked')
			}
			throw new Error(`${errorMessage}`)
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

	IsTweetEntry(entry) {
		const entryId = entry.entryId
		const dealList = [
			'homeConversation-',
			'tweet-'
		]
		const whitelist = [
			'whoToFollow-',
			'cursor-top-',
			'cursor-bottom-'
		]

		// only handle for two types for now
		const isTweetEntry = dealList.some(x => entryId.includes(x))

		if (entryId.includes('tombstone-')) {
			console.log(`Detect mature content: ${entryId}. Skipped.`)
		}
		else if (!isTweetEntry && !whitelist.some(x => entryId.includes(x))) {
			console.log(`Detect unhandled type: ${entryId}, ${JSON.stringify(entry)}`)
		}

		return isTweetEntry
	}

	GetTweetsFromTweetEntries(entry) {

		// homeConversation-xxxxx-1-tweet-xxxxx
		const type1 = [entry?.item].filter(Boolean)

		// tweet-xxxxx
		const type2 = [entry?.content].filter(x => x?.items == null && x)

		// homeConversation-xxxxx-xxxxx
		const type3 = [entry?.content?.items].filter(Boolean).flat().map(x => x.item)

		const contents = [type1, type2, type3].flat()
		const results = contents
			.map(x => x.itemContent.tweet_results.result)
			.map(x => x.__typename == 'TweetWithVisibilityResults' ? x.tweet : x)

		return results
	}

	GetTweetFromTweetEntry(entry) {
		const result = entry?.content?.itemContent?.tweet_results?.result
		const tweet = result.__typename == 'TweetWithVisibilityResults' ? result.tweet : result
		return tweet
	}

	IsRetweet(tweet) {
		return tweet.legacy.retweeted_status_result
	}

	IsSensitiveContent(tweet) {
		return tweet?.legacy?.possibly_sensitive ?? false
	}

	GetCursor(data) {
		const selector = entry =>
			entry?.content?.entryType === 'TimelineTimelineCursor' && entry?.content?.cursorType === 'Bottom'

		const entries = this.GetEntries(data)
		const cursors = entries.filter(selector)
		return cursors?.[0]?.content?.value
	}

	GetEntries(data) {
		return data.data.user.result.timeline.timeline.instructions.filter(x => x.type === 'TimelineAddEntries')[0].entries
	}
}

// Tests
if (require.main === module) {

	const csrfToken = ''
	const authToken = ''

	const account = 'HitenKei'
	const crawler = new TwitterCrawler(account, { csrfToken, authToken }, true, () => false, 1)

	// Crawl Test
	crawler.CrawlFromMainPage().then(result => {
		console.log('result = ', result)
		crawler.CrawlFromAdvancedSearch('2020-02-08', '2020-03-01').then(result => {
			console.log('result = ', result)
		})
	})

	// Fetch Test
	const case1 = '1585753743462518784' // normal content
	const case2 = '1586374516540047360' // mature content
	const tasks = [case1, case2].map(x => crawler.FetchFromTweet(x))
	Promise.all(tasks).then(console.log)
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler
