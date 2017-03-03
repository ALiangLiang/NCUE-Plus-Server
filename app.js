const
  CONFIG = require('./config.json'),
  GoogleAuth = require('google-auth-library'),
  auth = new GoogleAuth,
  client = new auth.OAuth2(CONFIG.client_id, '', ''),
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/', function(req, res) {
  console.log(req.query);
  Comment.findAll({
      include: [{
        model: Course,
        where: {
          courseName: req.query.courseName,
          courseClass: req.query.class
        }
      }, {
        model: User
      }]
    })
    .then((instances) => {
      const result = instances.map((e) => e.toJSON());
      console.log(result);
      res.send({
        comments: result.map((e) => {
          return {
            author: (e.anonymous) ? '匿名' : e.user.name,
            content: e.content,
            time: e.createdAt
          };
        })
      });
    }, (err) => console.error(err));
});

app.post('/', function(req, res) {
  const token = req.body.token;
  console.log(req.body);
  if (!req.body.courseClass || !req.body.courseName || !req.body.content || req.body.anonymous === undefined || !req.body.token)
    return res.send({
      isSuccess: false
    });
  client.verifyIdToken(
    token,
    CONFIG.client_id,
    function(e, login) {
      if (e)
        return res.send({
          isSuccess: false
        });
      const payload = login.getPayload();
      console.log(payload);
      return Promise.all([
          Course.findCreateFind({
            where: {
              courseClass: req.body.courseClass,
              courseName: req.body.courseName
            }
          }),
          User.findCreateFind({
            where: {
              email: payload.email,
              name: payload.name
            }
          })
        ])
        .then((instancesArray) => {
          return Comment.upsert({
              courseId: instancesArray[0][0].get('id'),
              userId: instancesArray[1][0].get('id'),
              anonymous: req.body.anonymous,
              content: req.body.content
            }, {
              include: [User, Course]
            })
            .then(() => {
              return Comment.findOne({
                where: {
                  courseId: instancesArray[0][0].get('id'),
                  userId: instancesArray[1][0].get('id'),
                  anonymous: req.body.anonymous,
                  content: req.body.content
                }
              }, {
                include: [User, Course]
              })
            });
        })
        .then((instance) => {
          res.send({
            isSuccess: true,
            author: (req.body.anonymous) ? '匿名' : payload.name,
            content: req.body.content,
            time: instance.toJSON().createdAt
          });
        }, (err) => console.error(err));
    });
});

app.listen(3000, function() {
  console.log('App listening on port 3000!');
});

const
  Sequelize = require('sequelize'),
  sequelize = new Sequelize(CONFIG.db_name, CONFIG.db_account, CONFIG.db_password, {
    dialect: 'mysql',
    dialectOptions: {
      charset: 'utf8mb4',
      collate: 'utf8mb4_unicode_ci',
      supportBigNumbers: true,
      bigNumberStrings: true
    }
  });

const
  Comment = sequelize.define('comment', {
    anonymous: {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    },
    content: {
      type: Sequelize.STRING(1023),
      allowNull: false,
      defaultValue: 'oops!! 沒內容!?'
    },
  }, {
    indexes: [{
      unique: true,
      fields: ['courseId', 'userId']
    }]
  }),
  User = sequelize.define('user', {
    email: {
      type: Sequelize.STRING,
      allowNull: false
    },
    name: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }),
  Course = sequelize.define('course', {
    courseClass: {
      type: Sequelize.STRING,
      allowNull: false
    },
    courseName: {
      type: Sequelize.STRING,
      allowNull: false
    }
  }, {
    indexes: [{
      unique: true,
      fields: ['courseClass', 'courseName']
    }]
  });
User.hasMany(Comment);
Course.hasMany(Comment);
Comment.belongsTo(User);
Comment.belongsTo(Course);

sequelize.sync({
    force: true
  })
  .then(() => {
    const fs = require('fs');
    return sequelize.query(fs.readFileSync('init.sql', 'utf8'))
      .then(() => sequelize.query(fs.readFileSync('init2.sql', 'utf8')));
  })
  .then(function() {}, (err) => console.error(err));
