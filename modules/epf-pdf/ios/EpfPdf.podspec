Pod::Spec.new do |s|
  s.name           = 'EpfPdf'
  s.version        = '1.0.0'
  s.summary        = 'On-device PDF text extraction for GuardBox'
  s.description    = 'Reads text from (optionally password-protected) PDFs with PDFKit.'
  s.author         = 'GuardBox'
  s.homepage       = 'https://github.com/libin2012/guardbox'
  s.license        = { type: 'UNLICENSED' }
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'PDFKit'

  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
