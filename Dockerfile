FROM node:20-alpine

# Install some test dependencies
RUN apk add --update curl

WORKDIR /usr/src/app

# Copies the package.json first for better cache on later pushes
COPY package.json ./

# Install dependencies
RUN npm install

# Copies the rest of the code
COPY . ./

# Test the build and run unit tests
RUN npm run test

# We only use this dockerfile for integration tests
# so use that as command
CMD ["npm", "run", "test:integration"]
