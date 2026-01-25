import SwiftUI

// MARK: - Color Palette
struct AppColors {
    // Orange palette
    static let orangeDark = Color(hex: "D94A1A")
    static let orangeMid = Color(hex: "F46B2A")
    static let orangeLight = Color(hex: "FFB36B")
    
    // Blue palette
    static let blueDark = Color(hex: "0B3A63")
    static let blueMid = Color(hex: "1E6FA8")
    static let blueLight = Color(hex: "7CC9FF")
    
    // Neutrals
    static let white = Color.white
    static let softGray = Color(hex: "EAF1F7")
    static let cardBackground = Color(hex: "FAFCFF")
}

// MARK: - Gradients
struct AppGradients {
    static let backgroundGradient = LinearGradient(
        colors: [
            AppColors.orangeLight,
            AppColors.orangeMid,
            AppColors.orangeDark
        ],
        startPoint: .top,
        endPoint: .bottom
    )
    
    static let cardGradient = LinearGradient(
        colors: [
            Color.white,
            AppColors.cardBackground,
            AppColors.softGray.opacity(0.5)
        ],
        startPoint: .top,
        endPoint: .bottom
    )
    
    static let buttonGradient = LinearGradient(
        colors: [AppColors.orangeMid, AppColors.orangeDark],
        startPoint: .top,
        endPoint: .bottom
    )
    
    static let glossOverlay = LinearGradient(
        colors: [
            Color.white.opacity(0.4),
            Color.white.opacity(0.1),
            Color.clear
        ],
        startPoint: .top,
        endPoint: .center
    )
    
    static let logPanelGradient = LinearGradient(
        colors: [
            AppColors.blueDark.opacity(0.95),
            AppColors.blueDark.opacity(0.85)
        ],
        startPoint: .top,
        endPoint: .bottom
    )
}

// MARK: - Typography
struct AppTypography {
    static let title = Font.system(size: 28, weight: .bold, design: .rounded)
    static let subtitle = Font.system(size: 14, weight: .medium, design: .rounded)
    static let button = Font.system(size: 15, weight: .semibold, design: .rounded)
    static let input = Font.system(size: 15, weight: .regular, design: .rounded)
    static let log = Font.system(size: 11, weight: .regular, design: .monospaced)
    static let logSmall = Font.system(size: 10, weight: .regular, design: .monospaced)
}

// MARK: - Shadows
struct AppShadows {
    static let card = Shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
    static let button = Shadow(color: AppColors.orangeDark.opacity(0.4), radius: 8, x: 0, y: 4)
    static let buttonPressed = Shadow(color: AppColors.orangeDark.opacity(0.2), radius: 4, x: 0, y: 2)
    static let blueGlow = Shadow(color: AppColors.blueLight.opacity(0.5), radius: 8, x: 0, y: 0)
}

struct Shadow {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat
}

// MARK: - Color Extension
extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (255, 0, 0, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}

// MARK: - View Modifiers
struct CardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(
                RoundedRectangle(cornerRadius: 28)
                    .fill(AppGradients.cardGradient)
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .fill(AppGradients.glossOverlay)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(
                                LinearGradient(
                                    colors: [AppColors.blueLight.opacity(0.6), AppColors.blueMid.opacity(0.3)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 2
                            )
                    )
                    .shadow(color: AppColors.blueLight.opacity(0.3), radius: 12, x: 0, y: 0)
                    .shadow(color: Color.black.opacity(0.15), radius: 20, x: 0, y: 10)
            )
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var isLoading: Bool = false
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.button)
            .foregroundColor(.white)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 14)
                    .fill(AppGradients.buttonGradient)
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(
                                LinearGradient(
                                    colors: [Color.white.opacity(0.3), Color.clear],
                                    startPoint: .top,
                                    endPoint: .center
                                )
                            )
                    )
            )
            .shadow(
                color: configuration.isPressed ? AppColors.orangeDark.opacity(0.2) : AppColors.orangeDark.opacity(0.4),
                radius: configuration.isPressed ? 4 : 8,
                x: 0,
                y: configuration.isPressed ? 2 : 4
            )
            .scaleEffect(configuration.isPressed ? 0.98 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    var tint: Color = AppColors.blueMid
    
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTypography.button)
            .foregroundColor(tint)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(Color.white.opacity(0.8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(tint.opacity(0.3), lineWidth: 1)
                    )
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(.easeInOut(duration: 0.15), value: configuration.isPressed)
    }
}

struct StyledTextFieldStyle: TextFieldStyle {
    var isFocused: Bool = false
    
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .font(AppTypography.input)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(
                RoundedRectangle(cornerRadius: 16)
                    .fill(Color.white.opacity(0.9))
                    .overlay(
                        RoundedRectangle(cornerRadius: 16)
                            .stroke(
                                isFocused ? AppColors.blueLight : AppColors.blueMid.opacity(0.2),
                                lineWidth: isFocused ? 2 : 1
                            )
                    )
                    .shadow(
                        color: isFocused ? AppColors.blueLight.opacity(0.3) : Color.clear,
                        radius: 8,
                        x: 0,
                        y: 0
                    )
            )
    }
}

extension View {
    func cardStyle() -> some View {
        modifier(CardStyle())
    }
}
