var express = require('express');
var util = require('./lib/utility');
var partials = require('express-partials');

var db = require('./app/config');
var Users = require('./app/collections/users');
var User = require('./app/models/user');
var Links = require('./app/collections/links');
var Link = require('./app/models/link');
var Click = require('./app/models/click');


var app = express();

app.use(express.cookieParser());
app.use(express.session({ secret: 'keyboard cat', cookie: { maxAge: 3000 }}))

app.configure(function() {
  app.set('views', __dirname + '/views');
  app.set('view engine', 'ejs');
  app.use(partials());
  app.use(express.bodyParser())
  app.use(express.static(__dirname + '/public'));
});

app.get('/', function(req, res) {
  // res.redirect('login');
  res.render('login');
});

app.get('/users', function(req, res) {
  Users.reset().fetch().then(function(users) {
    res.send(200, users.models);
  })
});

app.get('/login', function (req, res) {
  res.render('login');
});

app.get('/signup', function (req, res) {
  res.render('signup');
});

app.get('/create', function(req, res) {
  if (!req.session.auth) {
    res.redirect('/login');
  }
  res.render('index');
});

app.get('/links', function(req, res) {
  if (!req.session.auth) {
    res.redirect('login');
  }
  Links.reset().fetch().then(function(links) {
    res.send(200, links.models);
  })
});

app.post('/logout', function (req,res) {
  req.session.destroy(function (err) {
    res.redirect('/')
  });
});

app.post('/links', function(req, res) {
  if (!req.session.auth) {
    res.redirect('login');
  }
  var uri = req.body.url;

  if (!util.isValidUrl(uri)) {
    console.log('Not a valid url: ', uri);
    return res.send(404);
  }

  new Link({ url: uri }).fetch().then(function(found) {
    if (found) {
      res.send(200, found.attributes);
    } else {
      util.getUrlTitle(uri, function(err, title) {
        if (err) {
          console.log('Error reading URL heading: ', err);
          return res.send(404);
        }

        var link = new Link({
          url: uri,
          title: title,
          base_url: req.headers.origin
        });

        link.save().then(function(newLink) {
          Links.add(newLink);
          res.send(200, newLink);
        });
      });
    }
  });
});

/************************************************************/
// Write your authentication routes here
/************************************************************/

app.post('/signup', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  //hit up db to see if username exists
  //if username exists

  util.usernameExists(username, function (exists) {
    if (exists) {
      res.redirect('login');
    } else {
      var newUserObj = {
        username: username
      };
      util.hasher(password, function (hash) {
        newUserObj.password = hash;
        var newUser = new User(newUserObj);
      //send username and salted pw to server
        newUser.save().then(function (user) {
          Users.add(user);
          //redir to login
          res.redirect('login');
        })
      });
    }
  })
});

app.post('/login', function (req, res) {
  var username = req.body.username;
  var password = req.body.password;
  //hit up db
  util.usernameExists(username, function (exists) {
    //if username is in db
    if (exists) {
      //hit up db for pw
      util.getHashPassword(username, function (hash) {
        //if compare pw is true
        util.compareHash(password, hash, function (match) {
          if (match) {
            //start new session
            console.log('it\'s a match!')
            req.session.auth = true;
            res.redirect('create');
          } else {
            //if compare pw is false
            console.log('it\'s not a match!')
            //redir to login
            res.redirect('login');
          }
        });
      });
    //if username isn't in db
    } else {
      //redir to login
      res.redirect('login');
    }
  });
});


/************************************************************/
// Handle the wildcard route last - if all other routes fail
// assume the route is a short code and try and handle it here.
// If the short-code doesn't exist, send the user to '/'
/************************************************************/

app.get('/*', function(req, res) {
  new Link({ code: req.params[0] }).fetch().then(function(link) {
    if (!link) {
      res.redirect('/');
    } else {
      var click = new Click({
        link_id: link.get('id')
      });

      click.save().then(function() {
        db.knex('urls')
          .where('code', '=', link.get('code'))
          .update({
            visits: link.get('visits') + 1,
          }).then(function() {
            return res.redirect(link.get('url'));
          });
      });
    }
  });
});

console.log('Shortly is listening on 4568');
app.listen(4568);
