#!/usr/bin/env node

const minimist = require('minimist')
const { TwitterCrawler } = require('..')

if (require.main === module) {
    let startDate = '2018-01-13'
    let endDate = '2019-05-13'
    let account = 'hmw59750476'    
    new TwitterCrawler(account,startDate,endDate).Crawl().then(result => {
        console.log('result = ', result)
    })
}