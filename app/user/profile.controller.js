module.exports = ['user', 'User', 'Auth', '$location', '$timeout', '$filter',
  function(user, User, Auth, $location, $timeout, $filter) {
    var ctrl = this;

    // Edit Profile Fields
    this.editMode = false;
    this.error = {};
    this.user = {};

    user.$promise.then(function(user) {
      ctrl.user = user;
      ctrl.displayUsername = angular.copy(user.username);
      ctrl.displayEmail = angular.copy(user.email);
      ctrl.user.dob = $filter('date')(ctrl.user.dob, 'longDate');
      ctrl.userAge = calcAge(ctrl.user.dob);

      // This isn't the profile users true local time, just a placeholder
      ctrl.userLocalTime = $filter('date')(Date.now(), 'medium');
    });

    this.saveProfile = function() {
      User.update(this.user).$promise
      .then(function(data) {
        ctrl.user = data;
        ctrl.editMode = false;
        ctrl.error = {}; // reset error

        // Reformat DOB and calculate age on save
        ctrl.user.dob = $filter('date')(ctrl.user.dob, 'longDate');
        ctrl.userAge = calcAge(ctrl.user.dob);

        // redirect page if username changed
        if (ctrl.displayUsername !== ctrl.user.username) {
          $location.path('/profiles/' + ctrl.user.username);
          Auth.setUsername(ctrl.user.username);
        }
      })
      .catch(function(err) {
        ctrl.error.status = true;
        ctrl.error.message = err.data.error + ': ' + err.data.message;
      });
    };

    // Change Password Modal
    this.passData = {};
    this.changePassStatus = {};
    this.showChangePass = false;
    this.changePassModalVisible = false;

    this.openChangePassModal = function() {
      ctrl.showChangePass = true;
      ctrl.changePassModalVisible = true;
    };

    this.closeChangePassModal = function() {
      ctrl.showChangePass = false;
    };

    this.clearChangePassFields = function() {
      $timeout(function() {
        ctrl.changePassModalVisible = false;
        ctrl.passData.oldPass = '';
        ctrl.passData.password = '';
        ctrl.passData.confirmation = '';
        ctrl.changePassStatus = {};
      }, 500);
    };

    this.changePassword = function() {
      var changePassUser = {
        id: ctrl.user.id,
        old_password: ctrl.passData.oldPass,
        password: ctrl.passData.password,
        confirmation: ctrl.passData.confirmation,
      };
      User.update(changePassUser).$promise
      .then(function() {
        ctrl.passData = {};
        ctrl.changePassStatus.status = true;
        ctrl.changePassStatus.message = 'Sucessfully changed account password';
        ctrl.changePassStatus.type = 'success';
        $timeout(function() {
          ctrl.closeChangePassModal();
        }, 2000);
      })
      .catch(function(err) {
        ctrl.changePassStatus.status = true;
        ctrl.changePassStatus.message = err.data.message;
        ctrl.changePassStatus.type = 'alert';
      });
    };

    // Helper methods
    var calcAge = function(dob) {
      if (!dob) { return '';}
      dob = new Date(dob);
      var ageDiff = Date.now() - dob.getTime();
      var ageDate = new Date(ageDiff);
      return Math.abs(ageDate.getUTCFullYear() - 1970);
    };

  }
];

