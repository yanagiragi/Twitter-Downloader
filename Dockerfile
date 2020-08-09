FROM node:12.18.0
MAINTAINER yanagiragi <yanagiragi@csie.io>

RUN git clone https://github.com/yanagiragi/Twitter-Downloader.git
RUN cd Twitter-Downloader && npm install
