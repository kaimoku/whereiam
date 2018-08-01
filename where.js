'use latest';

var express    = require('express');
var Webtask    = require('webtask-tools');
var bodyParser = require('body-parser');
import { MongoClient } from 'mongodb';
import { ObjectId } from 'mongodb';
var app = express();

const collection = 'whereiam';

app.use(bodyParser.json());

var checkApiKey = function (req, res, next) {
  if (req.path.includes('umap')) {
    next();
    return;
  }
  var apiKey = req.header('apikey');
  if (apiKey === null || apiKey === undefined) {
    res.sendStatus(400);
    return;
  } 
  if (apiKey === req.webtaskContext.secrets.postkey) {
    next();
    return;
  }
  if (req.method === "GET" && apiKey === req.webtaskContext.secrets.apikey) {
    next();
    return;
  }
  res.sendStatus(403);
};

app.use(checkApiKey);

var respond = function(res, status, body) {
  res.writeHead(status, { "Content-type": "application/json" });
  var responseBody = (typeof(body) === "object") ? body : { "message": body };
  res.end(JSON.stringify(responseBody));
};

app.get('/umap', (req, res) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;

  MongoClient.connect(MONGO_URL, { auth: { user: MONGO_USER, password: MONGO_PASSWORD, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find().sort({"timestamp": -1}).toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
        return;
      }
      
      let csv = 'lat,lng,label\n';
      result.forEach(location => {
        csv += location.latitude + ',' + location.longitude + ',';
        if (location.hasOwnProperty('label')) {
          csv += location.label;
        }
        csv += '\n';
      });
      
      res.writeHead(200, { "Content-type": "text/csv" });
      res.end(csv);
    });
  });
});

// I'm using this as a health check
app.get('/', (req, res) => {
  res.sendStatus(200);
});

// GET all locations
app.get('/iwas', (req, res) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;
  
  MongoClient.connect(MONGO_URL, { auth: { user: MONGO_USER, password: MONGO_PASSWORD, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }

    const db = database.db('whereiam');
    db.collection(collection).find({}, {"_id": 0}).sort({"timestamp": -1}).toArray( (err, result) => {
      database.close();
      if (err) {
        console.log(err);
        respond(res, 500, "Server error when reading database");
      }
      
      respond(res, 200, result);
    });
  }); 
});

// GET the last location
app.get('/iam', (req, res) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;

  MongoClient.connect(MONGO_URL, { auth: { user: MONGO_USER, password: MONGO_PASSWORD, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find({}, {"_id": 0}).sort({"timestamp": -1}).limit(1).toArray( (err, result) => {
      database.close();
      if (err) {
        console.log(err);
        respond(res, 500, "Server error when reading database");
        return;
      }

      respond(res, 200, result[0]);
    });
  });
});

var findMissingKeys = function(json) {
  // required json keys
  let required = [ "latitude", "longitude", "label" ];
  let missing = [];
  for (var i = 0, len = required.length; i < len; i++) {
    if (!(required[i] in json)) {
      missing.push(required[i]);
    }
  }
  return missing;
};

// POST a new location
app.post('/iam', (req, res) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;
  
  let missing_keys = findMissingKeys(req.body);
  if (missing_keys.length > 0) {
    respond(res, 400, "The following required keys are missing: " + JSON.stringify(missing_keys));
    return;
  }
  var checkin = {
    "latitude": req.body.latitude,
    "longitude": req.body.longitude,
    "timestamp": (new Date()).toISOString(),
    "label": req.body.label
  };
  if (req.body.city) {
    checkin.city = req.body.city;
  }
  if (req.body.state) {
    checkin.state = req.body.state;
  }
  if (req.body.altitude) {
    checkin.altitude = req.body.altitude;
  }
  
  MongoClient.connect(MONGO_URL, { auth: { user: MONGO_USER, password: MONGO_PASSWORD, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when reading database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).insertOne(checkin, (err, result) => {
      database.close();
      if (err) {
        console.log(err);
        respond(res, 500, "Server error when writing database");
        return;
      }
      console.log(result);
      respond(res, 200, "Checkin added");
    });
  });
});

app.get('/iam/:id', (req, res) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;
  let id = ObjectId(req.params.id);

  MongoClient.connect(MONGO_URL, { auth: { user: MONGO_USER, password: MONGO_PASSWORD, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    console.log("id " + id);
    const db = database.db('whereiam');
    db.collection(collection).find({"_id": id}).toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
        return;
      }
      console.log("result: " + result);
      respond(res, 200, result[0]);
    });
  });
});

module.exports = Webtask.fromExpress(app);
