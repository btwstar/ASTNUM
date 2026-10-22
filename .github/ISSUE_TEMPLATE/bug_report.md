---
name: 🐛 Bug report
about: Something is broken or behaves incorrectly
title: "[Bug]: "
labels: bug
assignees: ""
body:
  - type: markdown
    attributes:
      value: |
        Thank you for taking the time to report! Please fill what you can — feel free to write in English or Arabic.
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: A clear description + what you expected instead.
      placeholder: "Steps: 1) … 2) … → Actual: … / Expected: …"
    validations:
      required: true
  - type: dropdown
    id: platform
    attributes:
      label: Platform
      options:
        - Android APK
        - Web browser
        - Both
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: App version
      placeholder: "e.g. 1.20.0 (Settings → About)"
  - type: input
    id: language
    attributes:
      label: App language
      placeholder: "e.g. Arabic, English, … (Settings → Languages)"
  - type: textarea
    id: logs
    attributes:
      label: Extra context
      description: Screenshots, console/adb errors, device model, Android version…
