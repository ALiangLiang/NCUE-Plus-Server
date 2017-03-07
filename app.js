const
  CONFIG = require('./config.json'),
  GoogleAuth = require('google-auth-library'),
  auth = new GoogleAuth,
  client = new auth.OAuth2(CONFIG.client_id, '', ''),
  express = require('express'),
  bodyParser = require('body-parser'),
  app = express(),
  PORT = (!process.argv.find((e) => e === '-d')) ? 3000 : 3001;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
  extended: true
}));

app.get('/course', function(req, res) {
  console.log(req.query);
  Course.findCreateFind({
      where: {
        courseName: req.query.courseName,
        courseClass: req.query.class
      }
    })
    .then((instances) => {
      const courseId = instances[0].get('id');
      return Promise.all([
        Promise.resolve(courseId),
        Request.count({
          where: {
            courseId: courseId
          }
        }),
        Comment.findAll({
          raw: true,
          group: ['`comment`.`id`'],
          attributes: ['id', 'anonymous', 'content', 'updatedAt'],
          where: {
            courseId: courseId
          },
          include: [{
            model: User,
            attributes: ['name']
          }, {
            model: Thumb,
            attributes: [
              [sequelize.fn('COUNT', sequelize.col('commentId')), 'thumbNum']
            ],
            or: true
          }]
        })
      ]);
    })
    .then((results) =>
      res.send({
        courseId: results[0],
        requestCount: results[1],
        comments: results[2].map((e) => {
          return {
            id: e.id,
            author: (e.anonymous === 1) ? '匿名' : e['user.name'],
            content: e.content,
            time: e.updatedAt,
            isRequest: true,
            thumbCount: Number(e['thumbs.thumbNum'])
          };
        })
      }), (err) => console.error(err));
});

function verifyIdentity(token) {
  if (!token) return Promise.reject();
  return new Promise((resolve, reject) => {
    console.log(123)
    client.verifyIdToken(
      token,
      CONFIG.client_id,
      function(e, login) {
        if (e)
          return reject(e);
        return resolve(login);
      });
  });
}

app.post('/comment', function(req, res) {
  const token = req.body.token;
  console.log(req.body);
  if (!req.body.courseClass || !req.body.courseName || !req.body.content || req.body.anonymous === undefined)
    return res.status(401).send({});
  else if (!req.body.token)
    return res.status(403).send({});
  verifyIdentity(token)
    .then((login) => {
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
              });
            });
        })
        .then((instance) =>
          res.status(201).send({
            id: instance.toJSON().id,
            author: (req.body.anonymous) ? '匿名' : payload.name,
            content: req.body.content,
            time: instance.toJSON().createdAt,
            thumbCount: 0
          }), (err) => console.error(err));

    }, () => res.status(401).send({}));
});

app.post('/thumb', function(req, res) {
  const token = req.body.token;
  verifyIdentity(token)
    .then((login) => {
      const payload = login.getPayload();
      return User.findCreateFind({
          where: {
            email: payload.email,
            name: payload.name
          }
        })
        .then((instance) =>
          Thumb.create({
            userId: instance[0].get('id'),
            commentId: req.body.commentId
          }));
    }, () => res.status(401).send({}))
    .then(() => res.status(201).send({}), (e) => {console.error(e);return res.status(403).send({})});
});

app.delete('/thumb/:commentId', function(req, res) {
  const
    token = req.body.token,
    commentId = req.params.commentId;
  verifyIdentity(token)
    .then((login) => {
      const payload = login.getPayload();
      return User.findCreateFind({
          where: {
            email: payload.email,
            name: payload.name
          }
        })
        .then((instance) => {
          return Thumb.destroy({
            where: {
              commentId: commentId
            },
            include: [{
              model: User,
              where: {
                email: payload.email
              }
            }]
          });
        }, () => res.status(401).send({}));
    })
    .then(() => res.status(201).send({}), () => res.status(404).send({}));
});

app.post('/request', function(req, res) {
  const token = req.body.token;
  verifyIdentity(token)
    .then((login) => {
      const payload = login.getPayload();
      return User.findCreateFind({
          where: {
            email: payload.email,
            name: payload.name
          }
        })
        .then((instances) =>
          Request.create({
            userId: instances[0].get('id'),
            courseId: req.body.courseId
          }));
    }, () => res.status(401).send({}))
    .then(() => res.status(201).send({}), () => res.status(403).send({}));
});

app.delete('/request/:courseId', function(req, res) {
  const
    token = req.body.token,
    courseId = req.params.courseId;
  verifyIdentity(token)
    .then((login) => {
      const payload = login.getPayload();
      return User.findCreateFind({
          where: {
            email: payload.email,
            name: payload.name
          }
        })
        .then((instances) =>
          Request.destroy({
            where: {
              userId: instances[0].get('id'),
              courseId: courseId
            }
          }), () => res.status(401).send({}))
        .then(() => res.status(201).send({}), () => res.status(404).send({}));
    });
});

app.listen(PORT, function() {
  console.log('App listening on port ' + PORT);
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
  }),
  Thumb = sequelize.define('thumb', {}, {
    indexes: [{
      unique: true,
      fields: ['commentId', 'userId']
    }]
  }),
  Request = sequelize.define('request', {}, {
    indexes: [{
      unique: true,
      fields: ['courseId', 'userId']
    }]
  });

User.hasMany(Comment);
Course.hasMany(Comment);
Comment.hasMany(Thumb);
User.hasMany(Thumb);
Course.hasMany(Request);
User.hasMany(Request);

Comment.belongsTo(User);
Comment.belongsTo(Course);
Thumb.belongsTo(Comment);
Thumb.belongsTo(User);
Request.belongsTo(Course);
Request.belongsTo(User);

sequelize.sync()
  .then(function() {}, (err) => console.error(err));
