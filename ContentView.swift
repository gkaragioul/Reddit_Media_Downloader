import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = DownloaderViewModel()
    @StateObject private var settings = SettingsModel.shared
    @FocusState private var isTextFieldFocused: Bool
    @State private var showSettings = false
    @State private var showAbout = false
    
    var body: some View {
        ZStack {
            AppBackgroundView()
            
            VStack(spacing: 0) {
                mainCard
            }
            .padding(32)
        }
        .frame(minWidth: 580, minHeight: 500)
    }
    
    private var mainCard: some View {
        ZStack(alignment: .topTrailing) {
            VStack(spacing: 20) {
                headerSection
                inputSection

                HStack {
                    if viewModel.isDownloading || viewModel.isPaused || !viewModel.progressText.isEmpty {
                        progressSection
                    } else {
                        statusOnlySection
                    }

                    Spacer()

                    settingsButton
                }
                .padding(.horizontal, 4)

                logPanel
            }
            .padding(28)

            // About button in top-right corner
            Button(action: { showAbout.toggle() }) {
                Image(systemName: "info.circle")
                    .font(.system(size: 16))
                    .foregroundColor(AppColors.blueMid)
            }
            .buttonStyle(.plain)
            .padding(16)
            .sheet(isPresented: $showAbout) {
                aboutView
            }
        }
        .cardStyle()
    }
    
    private var headerSection: some View {
        VStack(spacing: 8) {
            Image(nsImage: NSApp.applicationIconImage)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 56, height: 56)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
            
            Text("Reddit Profile Downloader")
                .font(AppTypography.title)
                .foregroundColor(AppColors.blueDark)

            Text("Download photos & videos from any public Reddit profile")
                .font(AppTypography.subtitle)
                .foregroundColor(AppColors.blueMid.opacity(0.8))
        }
        .padding(.bottom, 4)
    }
    
    private var inputSection: some View {
        HStack(spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "link")
                    .foregroundColor(AppColors.blueMid.opacity(0.5))
                    .font(.system(size: 14, weight: .medium))
                
                TextField("Reddit username or profile URL", text: $viewModel.profileInput)
                    .textFieldStyle(.plain)
                    .font(AppTypography.input)
                    .foregroundColor(AppColors.blueDark)
                    .focused($isTextFieldFocused)
                    .disabled(viewModel.isDownloading && !viewModel.isPaused && !viewModel.isCancelling)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.95))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isTextFieldFocused ? AppColors.blueLight : AppColors.blueMid.opacity(0.2),
                                lineWidth: isTextFieldFocused ? 2 : 1
                            )
                    )
                    .shadow(
                        color: isTextFieldFocused ? AppColors.blueLight.opacity(0.3) : Color.clear,
                        radius: 8
                    )
            )
            .animation(.easeInOut(duration: 0.2), value: isTextFieldFocused)
            
            if (viewModel.isDownloading || viewModel.isPaused) && !viewModel.isCancelling {
                controlButtons
            } else {
                downloadButton
            }
        }
    }
    
    private var settingsButton: some View {
        Button(action: { showSettings.toggle() }) {
            Image(systemName: "gearshape.fill")
                .font(.system(size: 14))
                .foregroundColor(AppColors.blueMid)
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showSettings, arrowEdge: .bottom) {
            settingsPopover
        }
    }
    
    private var aboutView: some View {
        VStack(spacing: 20) {
            // Header
            VStack(spacing: 12) {
                Image(nsImage: NSApp.applicationIconImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 80, height: 80)
                    .clipShape(RoundedRectangle(cornerRadius: 16))
                    .shadow(color: Color.black.opacity(0.1), radius: 4, x: 0, y: 2)
                
                Text("Reddit Profile Downloader")
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                
                Text("Version 1.0")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
            }
            .padding(.top, 20)
            
            Divider()
            
            // Developer info
            VStack(spacing: 8) {
                Text("Developed by")
                    .font(.system(size: 12))
                    .foregroundColor(.secondary)
                
                Text("George Karagioules")
                    .font(.system(size: 14, weight: .semibold))
                
                Link("georgekaragioules@gmail.com", destination: URL(string: "mailto:georgekaragioules@gmail.com")!)
                    .font(.system(size: 12))
            }
            
            Divider()
            
            // License notice
            ScrollView {
                Text(eulaText)
                    .font(.system(size: 10))
                    .foregroundColor(.secondary)
                    .multilineTextAlignment(.leading)
                    .padding(.horizontal)
            }
            .frame(height: 200)
            .background(Color(nsColor: .textBackgroundColor).opacity(0.5))
            .cornerRadius(8)
            .padding(.horizontal)
            
            // Close button
            Button("Close") {
                showAbout = false
            }
            .buttonStyle(.borderedProminent)
            .tint(AppColors.orangeMid)
            .padding(.bottom, 20)
        }
        .frame(width: 400, height: 520)
    }
    
    private var eulaText: String {
        """
        GNU GPLV3-OR-LATER LICENSE NOTICE
        
        Last Updated: June 2026
        
        Reddit Media Downloader is free software released under the GNU General Public License version 3 or later.
        
        1. SOFTWARE FREEDOM
        You may use, study, share, and modify this software under the terms of the GNU General Public License version 3 or later.
        
        2. SOURCE AND NOTICES
        The corresponding source code and third-party notices are available in the project repository:
        https://github.com/gkaragioul/Reddit_Media_Downloader
        
        3. USER RESPONSIBILITY
        Use this software only for media you have the right or permission to download. You are responsible for complying with Reddit's terms, RedGIFs' terms, copyright law, privacy rights, and local rules that apply to the content you download.
        
        4. NO AFFILIATION
        This project is not affiliated with, endorsed by, or sponsored by Reddit, RedGIFs, or any media host.
        
        5. DISCLAIMER OF WARRANTIES
        THE SOFTWARE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT.
        
        Copyright 2026 George Karagioules.
        
        Contact: georgekaragioules@gmail.com
        """
    }
    
    private var settingsPopover: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Settings")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.primary)
            
            Divider()
            
            // Speed mode
            HStack {
                Text("Speed:")
                    .font(.system(size: 12))
                Spacer()
                Picker("", selection: Binding(
                    get: { settings.speedMode },
                    set: { settings.speedMode = $0 }
                )) {
                    ForEach(SpeedMode.allCases) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 160)
                .disabled(viewModel.isDownloading)
            }
            
            // Concurrent downloads
            HStack {
                Text("Concurrent downloads:")
                    .font(.system(size: 12))
                Spacer()
                Picker("", selection: $settings.maxConcurrentDownloads) {
                    Text("2").tag(2)
                    Text("3").tag(3)
                    Text("4").tag(4)
                }
                .pickerStyle(.segmented)
                .frame(width: 120)
            }
            
            Divider()

            // Skip duplicates
            Toggle("Skip duplicate files", isOn: $settings.skipDuplicates)
                .font(.system(size: 12))

            Divider()

            // Batch mode
            Toggle("Batch mode", isOn: $settings.batchModeEnabled)
                .font(.system(size: 12))
            
            if settings.batchModeEnabled {
                HStack {
                    Text("Batch size:")
                        .font(.system(size: 11))
                    Spacer()
                    TextField("", value: $settings.batchSize, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 60)
                }
                
                HStack {
                    Text("Pause (seconds):")
                        .font(.system(size: 11))
                    Spacer()
                    TextField("", value: $settings.batchPauseSeconds, format: .number)
                        .textFieldStyle(.roundedBorder)
                        .frame(width: 60)
                }
            }
        }
        .padding(16)
        .frame(width: 280)
    }
    
    private var downloadButton: some View {
        HStack(spacing: 8) {
            Button(action: {
                Task {
                    await viewModel.startDownload(settings: settings)
                }
            }) {
                HStack(spacing: 8) {
                    Image(systemName: "arrow.down.circle.fill")
                        .font(.system(size: 16, weight: .semibold))
                    Text("Download")
                }
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(viewModel.profileInput.isEmpty)
            .opacity(viewModel.profileInput.isEmpty ? 0.6 : 1.0)

            Button(action: { viewModel.clearState() }) {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(SecondaryButtonStyle(tint: AppColors.orangeMid))
        }
    }
    
    private var controlButtons: some View {
        HStack(spacing: 8) {
            Button(action: { viewModel.togglePause() }) {
                Image(systemName: viewModel.isPaused ? "play.fill" : "pause.fill")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(SecondaryButtonStyle(tint: viewModel.isPaused ? AppColors.orangeMid : AppColors.blueMid))

            Button(action: { viewModel.cancelDownload() }) {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(SecondaryButtonStyle(tint: .red))

            Button(action: { viewModel.clearState() }) {
                Image(systemName: "trash")
                    .font(.system(size: 14, weight: .semibold))
            }
            .buttonStyle(SecondaryButtonStyle(tint: AppColors.orangeMid))
        }
    }
    
    private var statusOnlySection: some View {
        HStack(spacing: 8) {
            Image(systemName: "info.circle.fill")
                .font(.system(size: 11))
                .foregroundColor(AppColors.blueLight.opacity(0.7))

            Text(viewModel.statusText)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(AppColors.blueLight.opacity(0.9))
        }
    }

    private var progressSection: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                if viewModel.cooldownSeconds > 0 {
                    Image(systemName: "hourglass")
                        .foregroundColor(AppColors.orangeMid)
                        .font(.system(size: 12))
                } else if viewModel.isDownloading && !viewModel.isPaused {
                    ProgressView()
                        .scaleEffect(0.6)
                        .tint(AppColors.orangeMid)
                } else if viewModel.isPaused {
                    Image(systemName: "pause.circle.fill")
                        .foregroundColor(AppColors.orangeMid)
                        .font(.system(size: 12))
                }

                Text(viewModel.progressText)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(AppColors.blueDark.opacity(0.9))
            }

            // Overall progress bar
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background track
                    RoundedRectangle(cornerRadius: 3)
                        .fill(AppColors.blueMid.opacity(0.2))
                        .frame(height: 6)

                    // Progress fill
                    RoundedRectangle(cornerRadius: 3)
                        .fill(
                            LinearGradient(
                                gradient: Gradient(colors: [AppColors.orangeMid, AppColors.orangeMid.opacity(0.8)]),
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: geometry.size.width * viewModel.overallProgress, height: 6)
                        .animation(.easeInOut(duration: 0.3), value: viewModel.overallProgress)
                }
            }
            .frame(height: 6)

            // Status text
            HStack(spacing: 8) {
                Image(systemName: "info.circle.fill")
                    .font(.system(size: 11))
                    .foregroundColor(AppColors.blueLight.opacity(0.7))

                Text(viewModel.statusText)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(AppColors.blueLight.opacity(0.9))
                    .lineLimit(1)
                    .truncationMode(.tail)

                Spacer()

                // Network status indicator
                if viewModel.isDownloading {
                    HStack(spacing: 4) {
                        Circle()
                            .fill(viewModel.networkStatus == "Connected" ? Color.green : Color.red)
                            .frame(width: 6, height: 6)
                        Text(viewModel.networkStatus)
                            .font(.system(size: 10, weight: .medium))
                            .foregroundColor(viewModel.networkStatus == "Connected" ? Color.green : Color.red)
                    }
                }
            }
        }
    }
    
    private var logPanel: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 3) {
                    if viewModel.logLines.isEmpty {
                        Text("Ready. Enter a Reddit username or profile URL.")
                            .font(AppTypography.log)
                            .foregroundColor(AppColors.blueLight.opacity(0.6))
                            .padding(.vertical, 8)
                    } else {
                        ForEach(viewModel.logLines) { line in
                            Text(line.text)
                                .font(AppTypography.log)
                                .foregroundColor(line.isError ? Color(hex: "FF6B6B") : AppColors.blueLight.opacity(0.9))
                                .textSelection(.enabled)
                                .id(line.id)
                        }

                        // Show progress bar for current file download
                        if !viewModel.currentFileName.isEmpty && viewModel.currentFileProgress > 0 {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack(spacing: 8) {
                                    Image(systemName: "arrow.down.circle")
                                        .font(.system(size: 10))
                                        .foregroundColor(AppColors.orangeMid)

                                    Text("Downloading: \(viewModel.currentFileName)")
                                        .font(.system(size: 10, weight: .medium))
                                        .foregroundColor(AppColors.blueLight.opacity(0.8))
                                        .lineLimit(1)
                                        .truncationMode(.middle)
                                }

                                GeometryReader { geometry in
                                    ZStack(alignment: .leading) {
                                        Rectangle()
                                            .fill(AppColors.blueMid.opacity(0.2))
                                            .frame(height: 4)
                                            .cornerRadius(2)

                                        Rectangle()
                                            .fill(AppColors.orangeMid)
                                            .frame(width: geometry.size.width * viewModel.currentFileProgress, height: 4)
                                            .cornerRadius(2)
                                    }
                                }
                                .frame(height: 4)

                                Text("\(Int(viewModel.currentFileProgress * 100))%")
                                    .font(.system(size: 9, weight: .semibold))
                                    .foregroundColor(AppColors.orangeMid)
                            }
                            .padding(.top, 4)
                            .padding(.bottom, 2)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
            }
            .frame(height: 160)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(AppGradients.logPanelGradient)
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(AppColors.blueMid.opacity(0.3), lineWidth: 1)
                    )
            )
            .onChange(of: viewModel.logLines.count) { _ in
                if let last = viewModel.logLines.last {
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(last.id, anchor: .bottom)
                    }
                }
            }
        }
    }
}

#Preview {
    ContentView()
        .frame(width: 580, height: 500)
}
