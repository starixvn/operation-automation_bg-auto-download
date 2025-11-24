# Use Node.js LTS as base image
FROM hub.nexdev.net/base/node:20-bg-download

# Set working directory
WORKDIR /app

# Copy application files
COPY . .

RUN rm config.js
RUN cp config.LOCAL.js config.js

# Create downloads directory
RUN mkdir -p /app/downloads

# Expose API server port
EXPOSE 5000

# Set environment variables
ENV NODE_ENV=production
ENV DOWNLOAD_DIR=/app/downloads

# LOCAL
ENV HTTP_PROXY="http://proxysqd.nexdev.net:3128/"
ENV HTTPS_PROXY="http://proxysqd.nexdev.net:3128/"
ENV NO_PROXY="localhost,127.0.0.0/8,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,.nexdev.net"

# Default command - can be overridden
CMD ["npm", "run", "api"]

