var express    = require('express');
var Webtask    = require('webtask-tools');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json());

var checkApiKey = function (req, res, next) {
  var apiKey = req.header('apikey');
  if (apiKey === null || apiKey === undefined) {
    res.sendStatus(400);
    return;
  } 
  if (apiKey == req.webtaskContext.secrets.postkey) {
    next();
    return;
  }
  if (req.method == "GET" && apiKey == req.webtaskContext.secrets.apikey) {
    next();
    return;
  }
  res.sendStatus(403);
};

app.use(checkApiKey);

function respond(res, status, body) {
  res.writeHead(status, { "Content-type": "application/json" });
  var responseBody = (typeof(body) === "object") ? body : { "message": body };
  res.end(JSON.stringify(responseBody));
}

// I'm using this as a health check
app.get('/', function (req, res) {
  res.sendStatus(200);
});

// GET all locations
app.get('/iwas', function(req, res) {
  req.webtaskContext.storage.get(function(error, data) {
    if (error) {
      respond(res, 500, `Server error when reading database: $(error)`);
      return;
    }
    
    if (!data || !data.checkins) {
      respond(res, 500, "No checkins are stored in database");
      return;
    }
    
    respond(res, 200, data.checkins);
  });
});

// GET the last location
app.get('/iam', function(req, res) {
  req.webtaskContext.storage.get(function(error, data) {
    if (error) {
      respond(res, 500, `Server error when reading database: $(error)`);
      return;
    }
    
    if (!data || !data.checkins) {
      respond(res, 500, "No checkins are stored in database");
      return;
    }
    
    respond(res, 200, data.checkins[data.checkins.length - 1]);
  });  
});

function findMissingKeys(json) {
  // required json keys
  required = [ "latitude", "longitude" ];
  missing = [];
  for (var i = 0, len = required.length; i < len; i++) {
    if (!(required[i] in json)) {
      missing.push(required[i]);
    }
  }
  return missing;
}

// POST a new location
app.post('/iam', function (req, res) {
  req.webtaskContext.storage.get(function(error, data) {
    if (error) {
      respond(res, 500, `Server error when reading database: $(error)`);
      return;
    }
    
    if (!data) {
      data = {};
      data.checkins = [];
    }
    
    console.log(req.body);
    
    missing_keys = findMissingKeys(req.body);
    if (missing_keys.length > 0) {
      respond(res, 400, "The following required keys are missing: " + JSON.stringify(missing_keys));
      return;
    }
    var checkin = {
      "latitude": req.body.latitude,
      "longitude": req.body.longitude,
      "timestamp": (new Date()).toISOString()
    };

    data.checkins.push(checkin);
    
    req.webtaskContext.storage.set(data, function(error) {
      if (error) {
        respond(res, 500, `Server error when writing database: $(error)`);
        return;
      }
      
      respond(res, 200, "Checkin added");
    });
  });
});

// app.post('/clear', function(req, res) {
//   req.webtaskContext.storage.get(function(error, data) {
//     if (error) {
//       respond(res, 500, `Server error when reading db: ${error}`);
//       return;
//     }
    
//     data.checkins = [];
    
//     req.webtaskContext.storage.set(data, function(error) {
//       if (error) {
//         respond(res, 500, `Server error when writing db: ${error}`);
//         return;
//       }
      
//       respond(res, 200, "Checkins cleared");
//     });
//   });
// });

module.exports = Webtask.fromExpress(app);
