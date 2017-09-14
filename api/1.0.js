const
  GoogleAuth = require('google-auth-library'),
  auth = new GoogleAuth,
  CONFIG = require('./../config.json'),
  client = new auth.OAuth2(CONFIG.client_id, '', '');

module.exports = (sequelize, express, model, io) => {
  const {
    Comment,
    User,
    Course,
    Thumb,
    Request
  } = model;

  const {
    debug,
    error,
    info
  } = io;

  const api = express.Router();

  api.get('/course', function(req, res) {
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
      client.verifyIdToken(
        token,
        CONFIG.client_id,
        function(e, login) {
          if (e) {
            error('verifyIdentity error => %O', e);
            return reject(e);
          }
          return resolve(login);
        });
    });
  }

  api.post('/comment', function(req, res) {
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

  api.post('/thumb', async function(req, res) {
    const token = req.body.token;
    try {
      const login = await verifyIdentity(token);
      const payload = login.getPayload();
      try {
      await User.findCreateFind({
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
          res.status(201).send({});
      } catch (err){
        console.error(err);
        return res.status(403).send({});
      }
    }
    catch (err) {
      res.status(401).send({});
    }
  });

  api.delete('/thumb/:commentId', function(req, res) {
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

  api.post('/request', function(req, res) {
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

  api.delete('/request/:courseId', function(req, res) {
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

  return api;
};
