FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN sed -i 's/\r$//' /app/start-dev.sh \
    && chmod +x /app/start-dev.sh

EXPOSE 5656

CMD ["sh", "/app/start-dev.sh"]
