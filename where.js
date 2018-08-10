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
  if (req.path.includes('umap') || req.path.includes('geojson')) {
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

app.use((req, res, next) => {
  const { MONGO_URL } = req.webtaskContext.secrets;
  const { MONGO_USER } = req.webtaskContext.secrets;
  const { MONGO_PASSWORD } = req.webtaskContext.secrets;

  req.db = {
    "url": MONGO_URL,
    "user": MONGO_USER,
    "pw": MONGO_PASSWORD
  };
  next();
  return;
});

var respond = function(res, status, body) {
  res.writeHead(status, { "Content-type": "application/json" });
  var responseBody = (typeof(body) === "object") ? body : { "message": body };
  res.end(JSON.stringify(responseBody));
};

app.get('/umap', (req, res) => {
  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
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

app.get('/geojson', (req, res) => {
  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find().toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
        return;
      }
      
      let geojson = {
        "type": "FeatureCollection"
      };

      let color = "#FF0000";
      let features = [];
      result.forEach(loc => {
        let point = {
          "type": "Feature",
          "properties": {
            "id": loc._id.toString(),
            "name": loc.label,
            "timestamp": loc.timestamp,
            "altitude": loc.altitude ? loc.altitude : null,
            "previous": loc.previous ? loc.previous : null,
            "marker-color": color,
            "marker-size": "small",
            "marker-symbol": "",
          },
          "geometry": {
            "type": "Point",
            "coordinates": [ parseFloat(loc.longitude), parseFloat(loc.latitude) ]
          }
        };
        features.push(point);
        color = "#7E7E7E";
      });
      geojson.features = features;
      
      res.writeHead(200, { "Content-type": "application/vnd.geo+json" });
      res.end(JSON.stringify(geojson));
    });
  });
});

// I'm using this as a health check
app.get('/', (req, res) => {
  res.sendStatus(200);
});

// GET all locations
app.get('/iwas', (req, res) => {
  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }

    const db = database.db('whereiam');
    db.collection(collection).find({}, {"_id": 0}).sort({"timestamp": -1}).toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
      }
      
      respond(res, 200, result);
    });
  }); 
});

// GET the last location
app.get('/iam', (req, res) => {
  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find({}, {"_id": 0}).sort({"timestamp": -1}).limit(1).toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
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
  if (req.body.timestamp) {
    checkin.timestamp = new Date(req.body.timestamp).toISOString();
  }

  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when reading database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find({}, {"_id": 0}).sort({"timestamp": -1}).limit(1).toArray( (er, result) => {
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
        return;
      }

      checkin.previous = result[0]._id.toString();

      db.collection(collection).insertOne(checkin, (dberr, insres) => {
        database.close();
        if (dberr) {
          console.log(dberr);
          respond(res, 500, "Server error when writing database");
          return;
        }
        
        respond(res, 200, "Checkin added");
      });
    });
  });
});

app.get('/iam/:id', (req, res) => {
  let id = ObjectId(req.params.id);

  MongoClient.connect(req.db.url, { auth: { user: req.db.user, password: req.db.pw, } }, (err, database) => {
    if (err) {
      console.log(err);
      respond(res, 500, "Server error when opening database");
      return;
    }
    
    const db = database.db('whereiam');
    db.collection(collection).find({"_id": id}).toArray( (er, result) => {
      database.close();
      if (er) {
        console.log(er);
        respond(res, 500, "Server error when reading database");
        return;
      }

      respond(res, 200, result[0]);
    });
  });
});

module.exports = Webtask.fromExpress(app);
