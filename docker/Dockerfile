FROM node:latest

ADD https://api.github.com/repos/yanagiragi/Twitter-Downloader/git/refs/heads/master version.json
RUN git clone https://github.com/yanagiragi/Twitter-Downloader.git

RUN cd /Twitter-Downloader && npm install

WORKDIR /Twitter-Downloader

COPY ./fetchImage.sh /bin/fetchImage
RUN chmod u+x /bin/fetchImage

COPY ./fetchInfo.sh /bin/fetchInfo
RUN chmod u+x /bin/fetchInfo