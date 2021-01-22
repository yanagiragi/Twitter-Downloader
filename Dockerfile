FROM node:12.18.0
MAINTAINER yanagiragi <yanagiragi@csie.io>

ADD https://api.github.com/repos/yanagiragi/Twitter-Downloader/git/refs/heads/master version.json

RUN git clone https://github.com/yanagiragi/Twitter-Downloader.git
RUN cd Twitter-Downloader && npm install
