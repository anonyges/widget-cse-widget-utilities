/* Copyright start
  Copyright (C) 2008 - 2025 Fortinet Inc.
  All rights reserved.
  FORTINET CONFIDENTIAL & FORTINET PROPRIETARY SOURCE CODE
  Copyright end */
/* 
  author: kimd@fortinet.com
  modified: 260223
*/
"use strict";
(function () {
  angular
    .module("cybersponse")
    .controller("cseWidgetUtilities100Ctrl", cseWidgetUtilities100Ctrl);

  cseWidgetUtilities100Ctrl.$inject = [
    "$scope",
    "config",
    "cseJSUtil_v2",
    "cseFormEntityService_v2",
  ];

  function cseWidgetUtilities100Ctrl(
    $scope,
    config,
    cseJSUtil_v2,
    cseFormEntityService_v2,
  ) {
    $scope.config = config;
    $scope.form_body_uid = "cse-" + crypto.randomUUID();

    $scope.getObjectKeyLength = cseJSUtil_v2.getObjectKeyLength;
    $scope.getObjectKeySorted = cseJSUtil_v2.getObjectKeySorted;

    $scope.$on("$destroy", function () {
      $scope.$broadcast("$destory");
    });

    // -------------------------------------------------------- Form Entity Service Start  --------------------------------------------------------
    const csefes = cseFormEntityService_v2.init_view($scope);
    console.log(csefes.scopeDat, csefes.configDat);

    $scope.$on(`csefes_updated_fields`, (event, data) => {
      for (const [key, value] of Object.entries(data)) {
        if (Object.hasOwn(config.csefes.monitored_fields, key))
          console.log(`${key}: ${value}`);
      }
    });

    // -------------------------------------------------------- Form Entity Service End  --------------------------------------------------------

    console.debug("loaded fortinetCSEWidgetUtilities version 1.0.0", $scope);
  }
})();
