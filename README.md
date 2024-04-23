## webscraper-ts
This application requires Node.js v18+.

Made with axios + cheerio + playwright + node-json-db.


## Before running the app
First make directory named "data" in project home and create a file named "rules.json".

In this file, "rule" for each target web page should be given like below:

```json
[
  {
    "id": "example-1",
    "engineType": "playwright",
    "urlPattern": "[baseUrl]&query=[keyword]&from[start,yyyyMMdd]to[end,yyyyMMdd]&start=[page]",
    "urlParams": {
      "baseUrl": "",
      "keyword": "",
      "start": "2024-01-01",
      "end": "2024-01-31"
    },
    "pageParams": {
      "type": "url",
      "start": 1,
      "scale": 10,
      "maxPageNumber": 100
    },
    "linkSelectors": {
      "linkSelector": "a",
      "linkAttr": "href",
      "interval": 1000
    },
    "docSelectors": {
      "titleSelector": "#title_area",
      "datetimeSelector": "*[data-date-time]",
      "datetimeAttr": "data-date-time",
      "bodySelector": "#dic_area",
      "interval": 1000
    }
  }
]
```

### urlPattern & urlParams
- "urlPattern" should include "baseUrl"
- "start" & "end" should be datetime string format "YYYY-MM-dd", and it can be changed into the desired pattern if given.
- e.g. "www.example.com?sort=1&query=javascript&start=20200101&end=20200131" can be built with the rule as follows:

```
"urlPattern": "[baseUrl]&query=[keyword]&from[start,yyyyMMdd]to[end,yyyyMMdd]",
"urlParams": {
  "baseUrl": "www.example.com?sort=1",
  "keyword": "",
  "start": "2020-01-01",
  "end": "2020-01-31"
},
```

### pageParams
- When you want the scraper to access to the web pages repetitively while just updating paging parameters, pass the pageParams in rule json.
- "start" is the first page index and "scale" is the extent of change of page index by each pagination. 
- e.g. Access to pages like "www.example.com?p=1", "www.example.com?p=11", ... can be done with the rule as follows:

```
"type": "url",
"start": 1,
"scale": 10,
"maxPageNumber": 100
```

## Getting started
- Run on development mode
```bash
npm run dev
```

- Build production 
```bash
npm run build
```

- Run on production mode
```bash
npm run start
```

- Run tests with coverage summary
```bash
npm run test:cov
```

## Folder structure
- /src/db: Contains db service to get or store data with node-json-db.
- /src/engine: Contains engines and reusable classes for each engine.
- /src/lib: Contains reusable utility functions and logger.
- /coverage: Will be created after running tests with coverage option.
- /data: Contains queue, result json files which will be created by the scraper and rules.json.
- /dist: Will be created and updated when building production.
- /logs: Contains log files
