import SwiftUI

struct AppBackgroundView: View {
    var body: some View {
        ZStack {
            // Base orange gradient
            AppGradients.backgroundGradient
                .ignoresSafeArea()
            
            // Glossy highlight at top
            VStack {
                LinearGradient(
                    colors: [
                        Color.white.opacity(0.25),
                        Color.white.opacity(0.1),
                        Color.clear
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 200)
                
                Spacer()
            }
            .ignoresSafeArea()
            
            // Subtle radial glow in center
            RadialGradient(
                colors: [
                    AppColors.orangeLight.opacity(0.3),
                    Color.clear
                ],
                center: .center,
                startRadius: 50,
                endRadius: 400
            )
            .ignoresSafeArea()
            
            // Bottom shadow/depth
            VStack {
                Spacer()
                LinearGradient(
                    colors: [
                        Color.clear,
                        AppColors.orangeDark.opacity(0.3)
                    ],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 150)
            }
            .ignoresSafeArea()
        }
    }
}

#Preview {
    AppBackgroundView()
        .frame(width: 600, height: 500)
}
