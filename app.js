const
  CLIENT_ID = require('./config.json').client_id,
  GoogleAuth = require('google-auth-library'),
  auth = new GoogleAuth,
  client = new auth.OAuth2(CLIENT_ID, '', ''),
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', function(req, res) {
  Comment.findAll({
      where: {
        year: Number(req.query.year),
        semester: Number(req.query.semester),
        courseId: req.query.courseId,
      }
    })
    .then((instances) => {
      const result = instances.map((e) => e.toJSON());
      console.log(result);
      res.send({
        comments: result
      });
    });
});

app.post('/', function(req, res) {
  const token = req.body.token;
  console.log(req.body);
  if (!req.body.year || !req.body.semester || !req.body.courseId || !req.body.content || !req.body.token) {
    res.send({
      isSuccess: false
    });
    return;
  }
  client.verifyIdToken(
    token,
    CLIENT_ID,
    // Or, if multiple clients access the backend:
    //[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3],
    function(e, login) {
      console.log('123', e);
      if (e) {
        res.send({
          isSuccess: false
        });
        return;
      }
      var payload = login.getPayload();
      var userid = payload['sub'];
      console.log(payload);
      return Comment.create({
          year: Number(req.body.year),
          semester: Number(req.body.semester),
          courseId: req.body.courseId,
          author: payload.name,
          content: req.body.content,
        })
        .then(() => {
          res.send({
            isSuccess: true,
            author: payload.name,
            content: req.body.content,
          });
        });
    });
});

app.listen(3000, function() {
  console.log('Example app listening on port 3000!');
});

const Sequelize = require('sequelize');
const sequelize = new Sequelize('ncue-plus', 'ncue-plus', 'ncue-plus');

const Comment = sequelize.define('comment', {
  year: Sequelize.INTEGER,
  semester: Sequelize.INTEGER,
  courseId: Sequelize.STRING,
  author: Sequelize.STRING,
  content: Sequelize.STRING
});

sequelize.sync()
  .then(function() {
    return Comment.create({
      year: 105,
      semester: 2,
      courseId: '11025',
      author: '匿名',
      content: 'funny~~~'
    });
  })
  .then(function(jane) {
    console.log(jane.get({
      plain: true
    }));
  });
