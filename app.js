const
  express = require('express'),
  app = express();

app.get('/', function(req, res) {
  req.query.year
  req.query.semester
  req.query.courseId
  res.send({
    comments: [{
      author: '匿名',
      content: '不錯'
    }, {
      author: '匿名2',
      content: '不太好'
    }, {
      author: '匿名3',
      content: '沒意見'
    }]
  });
});

app.listen(3000, function() {
  console.log('Example app listening on port 3000!');
});
