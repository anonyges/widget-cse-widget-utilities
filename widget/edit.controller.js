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
    .controller(
      "editCseWidgetUtilities100DevCtrl",
      editCseWidgetUtilities100DevCtrl,
    );

  editCseWidgetUtilities100DevCtrl.$inject = [
    "$scope",
    "config",
    "$uibModalInstance",
    "Field",
    "cseJSUtil_v2",
    "cseFormEntityService_v2",
    "cseMonacoEditor_jsonjinja",
  ];

  function editCseWidgetUtilities100DevCtrl(
    $scope,
    config,
    $uibModalInstance,
    Field,
    cseJSUtil_v2,
    cseFormEntityService_v2,
    cseMonacoEditor_jsonjinja,
  ) {
    $scope.config = config;
    $scope.form_body_uid = "cse-" + crypto.randomUUID();

    $scope.getObjectKeyLength = cseJSUtil_v2.getObjectKeyLength;
    $scope.getObjectKeySorted = cseJSUtil_v2.getObjectKeySorted;

    $scope.$on("$destroy", function () {
      $scope.$broadcast("$destory");
    });

    // -------------------------------------------------------- Title Start  --------------------------------------------------------
    config.title = config.title ?? "";
    $scope.data_cs_title = new Field({
      name: "data_cs_title",
      formType: "text",
      title: "Title",
      writeable: true,
      validation: {
        required: false,
      },
    });

    config.title_show = config.title_show ?? false;
    // -------------------------------------------------------- Title End  --------------------------------------------------------

    // -------------------------------------------------------- Form Entity Service Start  --------------------------------------------------------
    const csefes = cseFormEntityService_v2.init_edit($scope);
    console.log(csefes.scopeDat, csefes.configDat);

    $scope.$on(`csefes_add_monitored_field`, (event, data) => {
      const field_name = data;
    });

    $scope.$on(`csefes_remove_monitored_field`, (event, data) => {
      const field_name = data;
    });
    // -------------------------------------------------------- Form Entity Service End  --------------------------------------------------------

    // -------------------------------------------------------- Monaco Editor Start  --------------------------------------------------------
    $scope.csemonaco = $scope?.csemonaco ?? {};
    config.csemonaco = config?.csemonaco ?? {};

    const eid_0 = "e0";
    $scope.csemonaco[eid_0] = $scope?.csemonaco?.[eid_0] ?? {};
    config.csemonaco[eid_0] = config?.csemonaco?.[eid_0] ?? {};
    $scope.csemonaco[eid_0].id = "monaco-" + crypto.randomUUID();

    cseJSUtil_v2
      .waitForElements([`#${$scope.csemonaco[eid_0].id}`])
      .then(() => {
        $scope.csemonaco[eid_0].editor =
          cseMonacoEditor_jsonjinja.create_editor($scope.csemonaco[eid_0].id);

        config.csemonaco[eid_0].content = "hello world!";
        $scope.csemonaco[eid_0].editor.setValue(
          config.csemonaco[eid_0].content,
        );
      });
    // -------------------------------------------------------- Monaco Editor End  --------------------------------------------------------

    // -------------------------------------------------------- UI start  --------------------------------------------------------
    $scope.bt_cancel = bt_cancel;
    $scope.bt_save = bt_save;

    function bt_cancel() {
      $uibModalInstance.dismiss("cancel");
    }

    function bt_save() {
      if ($scope.editWidgetForm.$invalid) {
        $scope.editWidgetForm.$setTouched();
        $scope.editWidgetForm.$focusOnFirstError();
        return;
      }
      $uibModalInstance.close($scope.config);
    }
    // -------------------------------------------------------- UI end  --------------------------------------------------------
  }
})();
