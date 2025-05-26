FROM selenium/node-chrome:4.18.1-20240226

WORKDIR /app

COPY package*.json ./

RUN npm install --force

COPY . .

RUN npx tsc

CMD [ "node", "dist/main.js" ]
