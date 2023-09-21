const fetch = require('node-fetch')
const cheerio = require('cheerio')
const { string } = require('easy-table')

const UserAgent = 'User-Agent: Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:84.0) Gecko/20100101 Firefox/84.0'

const defaulfCsrfToken = 'a1f272646de62b7f37cf2104814fceab'

class TwitterTweet {
	constructor(tweetId, photos, timestamp, content, isSensitive, videos = []) {
		this.content = content
		this.tweetId = tweetId
		this.photos = photos
		this.timestamp = timestamp
		this.hasPhoto = photos.length > 0
		this.isSensitive = isSensitive
		this.videos = videos
	}
}

class TwitterCrawler {
	constructor(account, cookie = null, verbose = true, EarlyBreakFunc = x => false, maxDepth = 1e9) {
		this.account = account
		this.cookie = cookie

		this.csrfToken = cookie?.split(';')?.filter(x => x.includes('ct0='))?.[0]?.replace('ct0=', '')
		if (!this.csrfToken) {
			console.log('Detect invalid cookie! Might not be able to fetch search infos and mature contents.')
		}

		this.fetchResults = [] // container for fetched results
		this.fetchRetweets = [] // container for fetched retweets for detect duplicate cases
		this.EarlyBreak = EarlyBreakFunc
		this.maxDepth = maxDepth
		this.verbose = verbose
		this.earlyBreakCount = 0
		this.displayFetchedTweets = false

		this.bottomCursor = '' // stay null for the first time
		this.guestId = '' // update later
		this.restId = '' // update later

		// Not expose yet configs
		this.dataPerCount = 20
		this.debug = false
	}

	async Preprocess () {

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

	async GetGuestID () {
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

	async GetRestID () {
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

	async FetchFromMainPage () {

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
		const content = await resp.text()
		try {
			const data = JSON.parse(content)
			this.bottomCursor = this.GetCursor(data)

			/*if (typeof data.timeline === 'undefined') {
				console.log(`Error When Request ${uri}, probably due to rate limit`)
				console.log(data)
				console.log(this.guestId)
			}*/

			return data
		} catch (error) {
			if (content.toString().trim() == 'Rate limit exceeded') {
				return { error: "Rate limit exceeded", cursor: this.bottomCursor }
			}
			return { error, cursor: this.bottomCursor }
		}
	}

	GatherPhotos (tweet) {
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

	GatherVideos (tweet) {
		const videos = []
		const entryMedia = tweet?.legacy?.extended_entities?.media
		if (entryMedia) {
			for (const media of entryMedia) {
				if (media?.type == 'video') {
					for (const variant of media?.video_info?.variants)
						videos.push(variant)
				}
			}
		}
		return videos
	}

	ParseMainPageResult (data) {

		const entries = this.GetEntries(data)
		const tweetEntries = entries
			.filter(this.IsTweetEntry)
			.map(this.GetTweetsFromTweetEntries)
			.flat()

		const getTweetResultFromTweet = tweet => {
			const tweetId = tweet.rest_id
			const content = tweet.legacy.full_text
			const timestamp = tweet.legacy.created_at // e.g. Sun May 31 02:40:23 +0000 2020
			const photos = this.GatherPhotos(tweet)
			const videos = this.GatherVideos(tweet)
			const isSensitive = this.IsSensitiveContent(tweet)
			return new TwitterTweet(tweetId, photos, timestamp, content, isSensitive, videos)
		}

		const retweetContainer = []
		const tweetContainer = []
		for (const tweet of tweetEntries) {
			const twitterTweet = getTweetResultFromTweet(tweet)
			if (this.IsRetweet(tweet)) {
				// if a tweet retweets previous tweet from himself, also collects it
				if (this.IsRetweetSelf(tweet)) {
					const newTwitterTweet = getTweetResultFromTweet(tweet.legacy.retweeted_status_result.result)
					tweetContainer.push(newTwitterTweet)
					console.error(`Collects https://twitter.com/${this.account}/status/${newTwitterTweet.tweetId} from https://twitter.com/${this.account}/status/${twitterTweet.tweetId}`)
				}
				retweetContainer.push(twitterTweet)
			} else {
				tweetContainer.push(twitterTweet)
			}
		}

		return [tweetContainer, retweetContainer]
	}

	async CrawlFromMainPage (depth = 0) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const data = await this.FetchFromMainPage()

		if (data?.error) {
			console.error(`Detect error when fetch tweets of ${this.account}, Error = ${JSON.stringify(data)}`)
			return [this.fetchResults, this.fetchRetweets]
		}

		if (this.debug) {
			console.log(JSON.stringify(data))
		}

		const [rawTweetResults, rawRetweetResults] = this.ParseMainPageResult(data)

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
		const shouldBreak = this.EarlyBreak(this, [rawTweetResults, rawRetweetResults])

		// eslint-disable-next-line no-trailing-spaces
		if (this.verbose) {
			console.log(`[${this.account}.CrawlFromMainPage] (${this.fetchResults.length}) <${results.length}, ${rawTweetResults.length}, ${retweetResults.length}, ${rawRetweetResults.length}>, depth = ${depth}, shouldBreak = ${shouldBreak}, cursor = ${this.bottomCursor}`)
		}

		if (this.debug || this.displayFetchedTweets) {
			this.PrettyPrintFetchedTweets(rawTweetResults, rawRetweetResults)
		}

		if (shouldBreak === false && depth <= this.maxDepth) {
			return this.CrawlFromMainPage(depth + 1)
		} else {
			return [this.fetchResults, this.fetchRetweets]
		}
	}

	async FetchFromTweet (tweetId) {

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

	PrettyPrintFetchedTweets (rawTweetResults, rawRetweetResults) {
		const trim = str => str.replaceAll('\n', '-').substring(0, 20)
		if (rawTweetResults.length > 0) {
			console.error(`\nTweets (${rawTweetResults.length}):`)
		}
		rawTweetResults.forEach(el => {
			console.error(`\t[${el.timestamp}] ${el.tweetId}: ${trim(el.content)}`)
		})
		if (rawRetweetResults.length > 0) {
			console.error(`\nRetweets (${rawRetweetResults.length}):`)
		}
		rawRetweetResults.forEach(el => {
			console.error(`\t[${el.timestamp}] ${el.tweetId}: ${trim(el.content)}`)
		})
		if (rawTweetResults.length > 0 || rawRetweetResults.length > 0) {
			console.error('')
		}
	}

	GetOptions (useNoLogin = false) {
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
				authorization: this.authorization,
				'x-twitter-auth-type': 'OAuth2Session',
				'x-csrf-token': this.csrfToken,
				'Cookie': this.cookie
			},
		}

		if (useNoLogin) {
			return noLoginOptions
		}

		let options = LoginOptions
		const isCredentialValid = this.csrfToken?.length > 0 ?? false
		if (!isCredentialValid) {
			console.log('Detect user does not provide cookie, use incognito mode instead. (unable to fetch mature contents)')
			options = noLoginOptions
		}

		return options
	}

	async CrawlFromAdvancedSearch (startDate, endDate, countPerRequest = 1000) {

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

		const [rawTweetResults, rawRetweetResults] = this.ParseSearchResult(this.restId, data)

		// Sometimes twitter returns duplicated results from different api calls
		// To deal with this, we filter the raw_results and leave only new TwitterTweets
		const isNotDuplicate = (ele, checkContainer) => {
			return checkContainer.length === 0 || checkContainer.filter(x => x.tweetId === ele.tweetId).length === 0
		}
		const results = rawTweetResults.filter(x => isNotDuplicate(x, this.fetchResults))
		const retweetResults = rawRetweetResults.filter(x => isNotDuplicate(x, this.fetchRetweets))

		return [results, retweetResults]
	}

	async FetchFromMedia () {
		const query = `{"userId":"${this.restId}","count":${this.dataPerCount},"includePromotedContent":false,"withClientEventToken":false,"withBirdwatchNotes":false,"withVoice":true,"withV2Timeline":true, "cursor": "${this.bottomCursor}"}`
		const features = `{"responsive_web_graphql_exclude_directive_enabled":true,"verified_phone_label_enabled":false,"creator_subscriptions_tweet_preview_api_enabled":true,"responsive_web_graphql_timeline_navigation_enabled":true,"responsive_web_graphql_skip_user_profile_image_extensions_enabled":false,"tweetypie_unmention_optimization_enabled":true,"responsive_web_edit_tweet_api_enabled":true,"graphql_is_translatable_rweb_tweet_is_translatable_enabled":true,"view_counts_everywhere_api_enabled":true,"longform_notetweets_consumption_enabled":true,"responsive_web_twitter_article_tweet_consumption_enabled":false,"tweet_awards_web_tipping_enabled":false,"freedom_of_speech_not_reach_fetch_enabled":true,"standardized_nudges_misinfo":true,"tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled":true,"longform_notetweets_rich_text_read_enabled":true,"longform_notetweets_inline_media_enabled":true,"responsive_web_media_download_video_enabled":false,"responsive_web_enhance_cards_enabled":false}`

		const options = this.GetOptions()

		const resp = await fetch(`https://twitter.com/i/api/graphql/Le6KlbilFmSu-5VltFND-Q/UserMedia?variables=${encodeURI(query)}&features=${encodeURI(features)}`, options)
		const content = await resp.text()

		try {
			const data = JSON.parse(content)
			this.bottomCursor = this.GetCursor(data)
			return data
		} catch (error) {
			if (content.toString().trim() == 'Rate limit exceeded') {
				return { error: "Rate limit exceeded", cursor: this.bottomCursor }
			}
			return { error, cursor: this.bottomCursor }
		}
	}

	async CrawlFromMedia (depth = 0) {
		await this.Preprocess()

		if (this.restId === '') {
			throw new Error('Error When Parsing Rest ID')
		}

		const data = await this.FetchFromMedia()

		if (data?.error) {
			console.error(`Detect error when fetch tweets of ${this.account}, Error = ${JSON.stringify(data)}`)
			return [this.fetchResults, this.fetchRetweets]
		}

		if (this.debug) {
			console.log(JSON.stringify(data))
		}

		const [rawTweetResults, rawRetweetResults] = this.ParseMainPageResult(data)

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
		const shouldBreak = this.EarlyBreak(this, [rawTweetResults, rawRetweetResults])

		// eslint-disable-next-line no-trailing-spaces
		if (this.verbose) {
			console.log(`[${this.account}.CrawlFromMedia] (${this.fetchResults.length}) <${results.length}, ${rawTweetResults.length}, ${retweetResults.length}, ${rawRetweetResults.length}>, depth = ${depth}, shouldBreak = ${shouldBreak}, cursor = ${this.bottomCursor}`)
		}

		if (this.debug || this.displayFetchedTweets) {
			this.PrettyPrintFetchedTweets(rawTweetResults, rawRetweetResults)
		}

		if (shouldBreak === false && depth <= this.maxDepth) {
			return this.CrawlFromMedia(depth + 1)
		} else {
			return [this.fetchResults, this.fetchRetweets]
		}
	}

	ParseSearchResult (restId, searchResults) {

		const tweetContainer = []
		const tweetSearches = Object.values(searchResults.globalObjects.tweets)

		for (const tweetSearch of tweetSearches) {

			// filter tweets not create from user
			// case: https://twitter.com/search?q=(from%3Ahechi_zou)%20until%3A2017-04-15%20since%3A2017-04-14&src=typed_query&f=top
			if (tweetSearch.user_id != restId) {
				continue
			}

			const tweetId = tweetSearch.id_str
			const content = tweetSearch.full_text
			const timestamp = tweetSearch.created_at // e.g. Sun May 31 02:40:23 +0000 2020

			const photos = this.GatherPhotosFromTweetSearch(tweetSearch)
			const isSensitive = this.IsSensitiveContentFromTweetSearch(tweetSearch)

			const twitterTweet = new TwitterTweet(tweetId, photos, timestamp, content, isSensitive)
			tweetContainer.push(twitterTweet)
		}

		// the result from search api are all tweets, no need to return retweet containers
		return [tweetContainer, []]
	}

	GatherPhotosFromTweetSearch (tweetSearch) {
		return tweetSearch.entities?.media?.map(x => `${x.media_url_https}:orig`) ?? []
	}

	IsSensitiveContentFromTweetSearch (tweetSearch) {
		return tweetSearch.possibly_sensitive ?? false
	}

	IsTweetEntry (entry) {
		const entryId = entry.entryId
		const dealList = [
			'homeConversation-',
			'tweet-'
		]
		const whitelist = [
			'whoToFollow-',
			'who-to-follow-',
			'cursor-top-',
			'cursor-bottom-',
			'profile-conversation-'
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

	GetTweetsFromTweetEntries (entry) {

		// homeConversation-xxxxx-1-tweet-xxxxx
		const type1 = [entry?.item].filter(Boolean)

		// tweet-xxxxx
		const type2 = [entry?.content].filter(x => x?.items == null && x)

		// homeConversation-xxxxx-xxxxx
		const type3 = [entry?.content?.items].filter(Boolean).flat().map(x => x.item)

		const contents = [type1, type2, type3].flat()
		const results = contents
			.map(x => x.itemContent.tweet_results.result)
			.filter(Boolean)
			.map(x => x.__typename == 'TweetWithVisibilityResults' ? x.tweet : x)

		return results
	}

	GetTweetFromTweetEntry (entry) {
		const result = entry?.content?.itemContent?.tweet_results?.result
		const tweet = result.__typename == 'TweetWithVisibilityResults' ? result.tweet : result
		return tweet
	}

	IsRetweet (tweet) {
		return tweet.legacy.retweeted_status_result
	}

	IsRetweetSelf (tweet) {
		return tweet.legacy.retweeted_status_result?.result?.legacy?.user_id_str == this.restId
	}

	IsSensitiveContent (tweet) {
		return tweet?.legacy?.possibly_sensitive ?? false
	}

	GetCursor (data) {
		const selector = entry =>
			entry?.content?.entryType === 'TimelineTimelineCursor' && entry?.content?.cursorType === 'Bottom'

		const entries = this.GetEntries(data)
		const cursors = entries.filter(selector)
		return cursors?.[0]?.content?.value
	}

	GetEntries (data) {
		const root = data.data.user.result.timeline ?? data.data.user.result.timeline_v2
		const entries = root.timeline.instructions.filter(x => x.type === 'TimelineAddEntries')[0].entries
		if (!this.bottomCursor) {
			return [
				entries,
				root.timeline.instructions.filter(x => x.type === 'TimelinePinEntry')?.[0]?.entry // deal tweets that are pinned
			].flat().filter(Boolean)
		}
		return entries
	}
}

// Tests
if (require.main === module) {
	(async function () {

		const cookie = ''
		const account = 'HitenKei'
		const crawler = new TwitterCrawler(account, cookie, true, () => false, 1)

		// Crawl Test
		let result = await crawler.CrawlFromMainPage()
		console.log('result = ', result)

		result = await crawler.CrawlFromAdvancedSearch('2020-02-08', '2020-03-01')
		console.log('result = ', result)

		result = await crawler.CrawlFromMedia()
		console.log('result = ', result)

		// Fetch Test
		const case1 = '1585753743462518784' // normal content
		const case2 = '1586374516540047360' // mature content
		const tasks = [case1, case2].map(x => crawler.FetchFromTweet(x))
		Promise.all(tasks).then(console.log)
	})()
}

exports.TwitterTweet = TwitterTweet
exports.TwitterCrawler = TwitterCrawler
