import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Modal,
  Platform,
  SafeAreaView,
  Animated,
  PanResponder,
  Dimensions,
} from "react-native";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { useDispatch, useSelector } from "react-redux";
import { RootState, AppDispatch } from "@/src/store";
import {
  analyzeMeal,
  postMeal,
  updateMeal,
  clearPendingMeal,
  clearError,
  loadPendingMeal,
} from "@/src/store/mealSlice";
import {
  Camera,
  X,
  Edit3,
  Save,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  ImageIcon,
  Zap,
  Target,
  Info,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import AsyncStorage from "@react-native-async-storage/async-storage";
import i18n from "@/src/i18n";
import { LinearGradient } from "expo-linear-gradient";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");

interface Ingredient {
  id: string;
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  fiber_g?: number;
  sugar_g?: number;
  sodium_mg?: number;
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const dispatch = useDispatch<AppDispatch>();
  const { pendingMeal, isAnalyzing, isPosting, isUpdating, error } =
    useSelector((state: RootState) => state.meal);

  const [permission, requestPermission] = useCameraPermissions();
  const [showCamera, setShowCamera] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [showEditModal, setShowEditModal] = useState(false);
  const [editText, setEditText] = useState("");
  const [mealName, setMealName] = useState("");
  const [mealDescription, setMealDescription] = useState("");
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [postedMealId, setPostedMealId] = useState<string | null>(null);
  const [originalImageBase64, setOriginalImageBase64] = useState<string>("");
  const [showIngredientEdit, setShowIngredientEdit] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  
  const cameraRef = useRef<CameraView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  // Load pending meal on component mount
  useEffect(() => {
    dispatch(loadPendingMeal());
  }, [dispatch]);

  // Handle errors
  useEffect(() => {
    if (error) {
      Alert.alert("Error", error, [
        { text: "OK", onPress: () => dispatch(clearError()) },
      ]);
    }
  }, [error, dispatch]);

  // Update local state when pending meal changes
  useEffect(() => {
    if (pendingMeal?.analysis) {
      setMealName(pendingMeal.analysis.meal_name || "");
      setMealDescription(pendingMeal.analysis.description || "");
      
      // Convert ingredients to proper format
      const formattedIngredients = (pendingMeal.analysis.ingredients || []).map((ing: any, index: number) => ({
        id: `ing_${index}`,
        name: typeof ing === 'string' ? ing : ing.name || `Ingredient ${index + 1}`,
        calories: typeof ing === 'string' ? 0 : ing.calories || 0,
        protein_g: typeof ing === 'string' ? 0 : ing.protein_g || ing.protein || 0,
        carbs_g: typeof ing === 'string' ? 0 : ing.carbs_g || ing.carbs || 0,
        fats_g: typeof ing === 'string' ? 0 : ing.fats_g || ing.fat || 0,
        fiber_g: typeof ing === 'string' ? 0 : ing.fiber_g || ing.fiber || 0,
        sugar_g: typeof ing === 'string' ? 0 : ing.sugar_g || ing.sugar || 0,
        sodium_mg: typeof ing === 'string' ? 0 : ing.sodium_mg || ing.sodium || 0,
      }));
      
      setIngredients(formattedIngredients);
      
      if (pendingMeal.image_base_64) {
        setOriginalImageBase64(pendingMeal.image_base_64);
      }
    }

    // Animate in when meal is loaded
    if (pendingMeal) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [pendingMeal]);

  // Check for persisted meal ID
  useEffect(() => {
    const checkPersistedMealId = async () => {
      try {
        const savedMealId = await AsyncStorage.getItem("postedMealId");
        if (savedMealId && pendingMeal) {
          setPostedMealId(savedMealId);
        }
      } catch (error) {
        console.error("Error loading persisted meal ID:", error);
      }
    };

    if (pendingMeal) {
      checkPersistedMealId();
    }
  }, [pendingMeal]);

  const saveMealId = async (mealId: string) => {
    try {
      await AsyncStorage.setItem("postedMealId", mealId);
    } catch (error) {
      console.error("Error saving meal ID:", error);
    }
  };

  const clearMealId = async () => {
    try {
      await AsyncStorage.removeItem("postedMealId");
    } catch (error) {
      console.error("Error clearing meal ID:", error);
    }
  };

  const validateAndProcessImage = (base64Data: string): string | null => {
    try {
      if (!base64Data || base64Data.trim() === "") {
        return null;
      }

      let cleanBase64 = base64Data;
      if (base64Data.startsWith("data:image/")) {
        const commaIndex = base64Data.indexOf(",");
        if (commaIndex !== -1) {
          cleanBase64 = base64Data.substring(commaIndex + 1);
        }
      }

      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(cleanBase64)) {
        return null;
      }

      if (cleanBase64.length < 1000) {
        return null;
      }

      return cleanBase64;
    } catch (error) {
      console.error("Error validating image:", error);
      return null;
    }
  };

  const analyzeImage = async (base64Image: string) => {
    try {
      const currentLanguage = i18n.language || "en";
      const validatedBase64 = validateAndProcessImage(base64Image);

      if (!validatedBase64) {
        Alert.alert("Error", "Invalid image. Please try again.");
        return;
      }

      setOriginalImageBase64(validatedBase64);
      setPostedMealId(null);
      await clearMealId();

      const result = await dispatch(
        analyzeMeal({
          imageBase64: validatedBase64,
          language: currentLanguage,
        })
      );

      if (!analyzeMeal.fulfilled.match(result)) {
        Alert.alert("Error", "Analysis failed. Please try again.");
      }
    } catch (error) {
      console.error("Analysis error:", error);
      Alert.alert("Error", "Analysis failed. Please try again.");
    }
  };

  const reAnalyzeWithEdits = async () => {
    try {
      const currentLanguage = i18n.language || "en";
      const imageToUse = originalImageBase64 || pendingMeal?.image_base_64;

      if (!imageToUse) {
        Alert.alert("Error", "No image available for re-analysis.");
        return;
      }

      const validatedBase64 = validateAndProcessImage(imageToUse);
      if (!validatedBase64) {
        Alert.alert("Error", "Invalid image data.");
        return;
      }

      // Create update text with current edits
      const updateText = `
        Updated meal name: ${mealName}
        Updated description: ${mealDescription}
        Corrected ingredients: ${ingredients.map(ing => ing.name).join(", ")}
        ${editText ? `Additional notes: ${editText}` : ""}
      `.trim();

      const result = await dispatch(
        analyzeMeal({
          imageBase64: validatedBase64,
          updateText: updateText,
          language: currentLanguage,
        })
      );

      if (analyzeMeal.fulfilled.match(result)) {
        setShowEditModal(false);
        setEditText("");
      } else {
        Alert.alert("Error", "Re-analysis failed. Please try again.");
      }
    } catch (error) {
      console.error("Re-analysis error:", error);
      Alert.alert("Error", "Re-analysis failed. Please try again.");
    }
  };

  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
        exif: false,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        if (asset.base64) {
          await analyzeImage(asset.base64);
        } else {
          Alert.alert("Error", "No image data available.");
        }
      }
    } catch (error) {
      console.error("Error in pickImage:", error);
      Alert.alert("Error", "Failed to pick image.");
    }
  };

  const takePicture = async () => {
    if (cameraRef.current && !isAnalyzing) {
      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.8,
          base64: true,
        });

        if (photo && photo.base64) {
          setShowCamera(false);
          await analyzeImage(photo.base64);
        } else {
          Alert.alert("Error", "Failed to capture image.");
        }
      } catch (error) {
        console.error("Camera error:", error);
        Alert.alert("Error", "Failed to capture image.");
      }
    }
  };

  const handlePost = async () => {
    if (pendingMeal && !isPosting) {
      // Update the pending meal with current edits before posting
      const updatedAnalysis = {
        ...pendingMeal.analysis,
        meal_name: mealName,
        description: mealDescription,
        ingredients: ingredients,
      };

      const result = await dispatch(postMeal());

      if (postMeal.fulfilled.match(result)) {
        const mealId = result.payload?.meal_id?.toString();
        if (mealId) {
          setPostedMealId(mealId);
          await saveMealId(mealId);
          Alert.alert("Success", "Meal saved successfully!");
        }
      } else {
        Alert.alert("Error", "Failed to save meal.");
      }
    }
  };

  const handleUpdate = async () => {
    if (!postedMealId) {
      Alert.alert("Error", "Please save the meal first before updating.");
      return;
    }

    try {
      const updateText = `
        Updated meal name: ${mealName}
        Updated description: ${mealDescription}
        Updated ingredients: ${ingredients.map(ing => `${ing.name} (${ing.calories} cal)`).join(", ")}
        ${editText ? `Additional notes: ${editText}` : ""}
      `.trim();

      const result = await dispatch(
        updateMeal({
          meal_id: postedMealId,
          updateText: updateText,
        })
      );

      if (updateMeal.fulfilled.match(result)) {
        Alert.alert("Success", "Meal updated successfully!");
        setShowEditModal(false);
        setEditText("");

        // Clear the current state and reload
        dispatch(clearPendingMeal());
        setPostedMealId(null);
        setOriginalImageBase64("");
        await clearMealId();
      } else {
        Alert.alert("Error", "Failed to update meal.");
      }
    } catch (error) {
      console.error("Update error:", error);
      Alert.alert("Error", "Failed to update meal.");
    }
  };

  const handleDiscard = async () => {
    Alert.alert("Confirm", "Are you sure you want to discard this analysis?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: async () => {
          dispatch(clearPendingMeal());
          setPostedMealId(null);
          setOriginalImageBase64("");
          setMealName("");
          setMealDescription("");
          setIngredients([]);
          await clearMealId();
        },
      },
    ]);
  };

  const removeIngredient = (ingredientId: string) => {
    setIngredients(prev => prev.filter(ing => ing.id !== ingredientId));
  };

  const editIngredient = (ingredient: Ingredient) => {
    setEditingIngredient(ingredient);
    setShowIngredientEdit(true);
  };

  const saveIngredientEdit = () => {
    if (editingIngredient) {
      setIngredients(prev => 
        prev.map(ing => 
          ing.id === editingIngredient.id ? editingIngredient : ing
        )
      );
      setEditingIngredient(null);
      setShowIngredientEdit(false);
    }
  };

  const createDraggableIngredient = (ingredient: Ingredient, index: number) => {
    const pan = useRef(new Animated.ValueXY()).current;
    const opacity = useRef(new Animated.Value(1)).current;

    const panResponder = PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        Animated.timing(opacity, {
          toValue: 0.8,
          duration: 100,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (evt, gestureState) => {
        const { dx, dy } = gestureState;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 100) {
          // Remove ingredient if dragged far enough
          Animated.timing(opacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            removeIngredient(ingredient.id);
          });
        } else {
          // Snap back
          Animated.parallel([
            Animated.spring(pan, {
              toValue: { x: 0, y: 0 },
              useNativeDriver: false,
            }),
            Animated.timing(opacity, {
              toValue: 1,
              duration: 200,
              useNativeDriver: true,
            }),
          ]).start();
        }
      },
    });

    return (
      <Animated.View
        key={ingredient.id}
        style={[
          styles.ingredientCard,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
            opacity: opacity,
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          style={styles.ingredientContent}
          onPress={() => editIngredient(ingredient)}
          activeOpacity={0.8}
        >
          <View style={styles.ingredientHeader}>
            <Text style={styles.ingredientName}>{ingredient.name}</Text>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => removeIngredient(ingredient.id)}
            >
              <X size={16} color="#ef4444" />
            </TouchableOpacity>
          </View>
          <View style={styles.ingredientNutrition}>
            <Text style={styles.nutritionText}>{ingredient.calories} cal</Text>
            <Text style={styles.nutritionText}>{ingredient.protein_g}g protein</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.permissionContainer}>
          <Camera size={80} color="#10b981" />
          <Text style={styles.permissionTitle}>Camera Permission Required</Text>
          <Text style={styles.permissionText}>
            We need camera permission to analyze your meals
          </Text>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={requestPermission}
          >
            <Text style={styles.primaryButtonText}>Grant Permission</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (showCamera) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView style={styles.camera} facing={facing} ref={cameraRef}>
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.3)']}
            style={styles.cameraOverlay}
          >
            <View style={styles.cameraHeader}>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={() => setShowCamera(false)}
              >
                <X size={24} color="white" />
              </TouchableOpacity>
              <Text style={styles.cameraTitle}>Capture Your Meal</Text>
              <TouchableOpacity
                style={styles.cameraButton}
                onPress={() =>
                  setFacing((current) =>
                    current === "back" ? "front" : "back"
                  )
                }
              >
                <RotateCcw size={24} color="white" />
              </TouchableOpacity>
            </View>

            <View style={styles.cameraCenter}>
              <View style={styles.focusFrame} />
              <Text style={styles.focusText}>
                Position your meal within the frame for best results
              </Text>
            </View>

            <View style={styles.cameraFooter}>
              <TouchableOpacity
                style={[
                  styles.captureButton,
                  isAnalyzing && styles.captureButtonDisabled,
                ]}
                onPress={takePicture}
                disabled={isAnalyzing}
              >
                <View style={styles.captureButtonInner}>
                  <Camera size={28} color="white" />
                </View>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </CameraView>
      </View>
    );
  }

  if (pendingMeal) {
    const isPosted = !!postedMealId;
    const totalCalories = ingredients.reduce((sum, ing) => sum + ing.calories, 0);
    const totalProtein = ingredients.reduce((sum, ing) => sum + ing.protein_g, 0);
    const totalCarbs = ingredients.reduce((sum, ing) => sum + ing.carbs_g, 0);
    const totalFat = ingredients.reduce((sum, ing) => sum + ing.fats_g, 0);

    return (
      <SafeAreaView style={styles.container}>
        <ScrollView
          style={styles.scrollContainer}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Animated.View
            style={[
              styles.analysisContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View style={styles.statusIndicator}>
                  {isPosted ? (
                    <CheckCircle size={20} color="#10b981" />
                  ) : (
                    <Zap size={20} color="#f59e0b" />
                  )}
                  <Text style={[styles.statusText, isPosted && styles.statusTextSaved]}>
                    {isPosted ? "Saved" : "Analyzed"}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.discardButton}
                onPress={handleDiscard}
              >
                <Trash2 size={20} color="#ef4444" />
              </TouchableOpacity>
            </View>

            {/* Image Display */}
            <View style={styles.imageCard}>
              <Image
                source={{
                  uri: `data:image/jpeg;base64,${pendingMeal.image_base_64}`,
                }}
                style={styles.mealImage}
              />
              <View style={styles.imageOverlay}>
                <TouchableOpacity
                  style={styles.editImageButton}
                  onPress={() => setShowEditModal(true)}
                >
                  <Edit3 size={16} color="white" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Meal Info Card */}
            <View style={styles.mealInfoCard}>
              <View style={styles.mealInfoHeader}>
                <Target size={20} color="#10b981" />
                <Text style={styles.mealInfoTitle}>Meal Information</Text>
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Meal Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={mealName}
                  onChangeText={setMealName}
                  placeholder="Enter meal name..."
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Description</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={mealDescription}
                  onChangeText={setMealDescription}
                  placeholder="Describe your meal..."
                  placeholderTextColor="#9ca3af"
                  multiline
                  numberOfLines={3}
                />
              </View>
            </View>

            {/* Nutrition Summary */}
            <View style={styles.nutritionCard}>
              <View style={styles.nutritionHeader}>
                <Info size={20} color="#10b981" />
                <Text style={styles.nutritionTitle}>Nutrition Summary</Text>
              </View>
              
              <View style={styles.nutritionGrid}>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{totalCalories}</Text>
                  <Text style={styles.nutritionLabel}>Calories</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{totalProtein.toFixed(1)}g</Text>
                  <Text style={styles.nutritionLabel}>Protein</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{totalCarbs.toFixed(1)}g</Text>
                  <Text style={styles.nutritionLabel}>Carbs</Text>
                </View>
                <View style={styles.nutritionItem}>
                  <Text style={styles.nutritionValue}>{totalFat.toFixed(1)}g</Text>
                  <Text style={styles.nutritionLabel}>Fat</Text>
                </View>
              </View>
            </View>

            {/* Ingredients Section */}
            <View style={styles.ingredientsCard}>
              <View style={styles.ingredientsHeader}>
                <Text style={styles.ingredientsTitle}>Ingredients</Text>
                <Text style={styles.ingredientsSubtitle}>
                  Drag to remove • Tap to edit
                </Text>
              </View>

              <View style={styles.ingredientsList}>
                {ingredients.map((ingredient, index) =>
                  createDraggableIngredient(ingredient, index)
                )}
              </View>

              {ingredients.length === 0 && (
                <View style={styles.emptyIngredients}>
                  <AlertCircle size={24} color="#9ca3af" />
                  <Text style={styles.emptyIngredientsText}>
                    No ingredients detected
                  </Text>
                </View>
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setShowEditModal(true)}
                disabled={isPosting || isUpdating}
              >
                <Edit3 size={18} color="#10b981" />
                <Text style={styles.editButtonText}>Edit Analysis</Text>
              </TouchableOpacity>

              {!isPosted ? (
                <TouchableOpacity
                  style={[styles.primaryButton, (isPosting || isUpdating) && styles.buttonDisabled]}
                  onPress={handlePost}
                  disabled={isPosting || isUpdating}
                >
                  {isPosting ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <Save size={18} color="white" />
                      <Text style={styles.primaryButtonText}>Save Meal</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.primaryButton, (isPosting || isUpdating) && styles.buttonDisabled]}
                  onPress={handleUpdate}
                  disabled={isPosting || isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <>
                      <RotateCcw size={18} color="white" />
                      <Text style={styles.primaryButtonText}>Update</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Edit Modal */}
          <Modal
            visible={showEditModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowEditModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Analysis</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setShowEditModal(false)}
                  >
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.modalSubtitle}>
                  Provide corrections or additional context about your meal
                </Text>

                <TextInput
                  style={styles.modalTextInput}
                  placeholder="Add corrections or additional details..."
                  placeholderTextColor="#9ca3af"
                  value={editText}
                  onChangeText={setEditText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                  autoFocus={true}
                />

                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={styles.modalCancelButton}
                    onPress={() => setShowEditModal(false)}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalConfirmButton}
                    onPress={reAnalyzeWithEdits}
                    disabled={!editText.trim()}
                  >
                    <Text style={styles.modalConfirmButtonText}>Re-analyze</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Ingredient Edit Modal */}
          <Modal
            visible={showIngredientEdit}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowIngredientEdit(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modal}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Ingredient</Text>
                  <TouchableOpacity
                    style={styles.modalCloseButton}
                    onPress={() => setShowIngredientEdit(false)}
                  >
                    <X size={24} color="#6b7280" />
                  </TouchableOpacity>
                </View>

                {editingIngredient && (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Name</Text>
                      <TextInput
                        style={styles.textInput}
                        value={editingIngredient.name}
                        onChangeText={(text) =>
                          setEditingIngredient({ ...editingIngredient, name: text })
                        }
                        placeholder="Ingredient name"
                      />
                    </View>

                    <View style={styles.nutritionEditGrid}>
                      <View style={styles.nutritionEditItem}>
                        <Text style={styles.inputLabel}>Calories</Text>
                        <TextInput
                          style={styles.numberInput}
                          value={editingIngredient.calories.toString()}
                          onChangeText={(text) =>
                            setEditingIngredient({
                              ...editingIngredient,
                              calories: parseFloat(text) || 0,
                            })
                          }
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.nutritionEditItem}>
                        <Text style={styles.inputLabel}>Protein (g)</Text>
                        <TextInput
                          style={styles.numberInput}
                          value={editingIngredient.protein_g.toString()}
                          onChangeText={(text) =>
                            setEditingIngredient({
                              ...editingIngredient,
                              protein_g: parseFloat(text) || 0,
                            })
                          }
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    <View style={styles.modalButtons}>
                      <TouchableOpacity
                        style={styles.modalCancelButton}
                        onPress={() => setShowIngredientEdit(false)}
                      >
                        <Text style={styles.modalCancelButtonText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.modalConfirmButton}
                        onPress={saveIngredientEdit}
                      >
                        <Text style={styles.modalConfirmButtonText}>Save</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                )}
              </View>
            </View>
          </Modal>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.homeContainer}>
        <View style={styles.welcomeHeader}>
          <Text style={styles.welcomeTitle}>Smart Food Analysis</Text>
          <Text style={styles.welcomeSubtitle}>
            Capture your meal and get instant nutritional insights
          </Text>
        </View>

        {(isAnalyzing) && (
          <View style={styles.analyzingCard}>
            <ActivityIndicator size="large" color="#10b981" />
            <Text style={styles.analyzingTitle}>Analyzing Your Meal</Text>
            <Text style={styles.analyzingText}>
              Please wait while we process your image...
            </Text>
          </View>
        )}

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[
              styles.mainButton,
              styles.cameraButtonStyle,
              isAnalyzing && styles.buttonDisabled,
            ]}
            onPress={() => setShowCamera(true)}
            disabled={isAnalyzing}
          >
            <LinearGradient
              colors={['#10b981', '#059669']}
              style={styles.buttonGradient}
            >
              <Camera size={24} color="white" />
              <Text style={styles.mainButtonText}>Take Picture</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.mainButton,
              styles.galleryButtonStyle,
              isAnalyzing && styles.buttonDisabled,
            ]}
            onPress={pickImage}
            disabled={isAnalyzing}
          >
            <ImageIcon size={24} color="#10b981" />
            <Text style={styles.galleryButtonText}>Choose from Gallery</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.tipCard}>
          <View style={styles.tipIcon}>
            <Info size={20} color="#10b981" />
          </View>
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Tips for Best Results</Text>
            <Text style={styles.tipText}>
              • Ensure good lighting{'\n'}
              • Capture the entire meal{'\n'}
              • Avoid shadows and reflections{'\n'}
              • Keep the camera steady
            </Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffff",
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  homeContainer: {
    flex: 1,
    padding: 20,
  },
  welcomeHeader: {
    alignItems: "center",
    marginBottom: 40,
    paddingTop: 20,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1f2937",
    marginBottom: 8,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    lineHeight: 24,
  },
  buttonContainer: {
    gap: 16,
    marginBottom: 32,
  },
  mainButton: {
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  buttonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  cameraButtonStyle: {
    // Gradient applied inside
  },
  galleryButtonStyle: {
    backgroundColor: "#f9fafb",
    borderWidth: 2,
    borderColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  mainButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  galleryButtonText: {
    color: "#10b981",
    fontSize: 16,
    fontWeight: "600",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  tipCard: {
    flexDirection: "row",
    backgroundColor: "#f0fdf4",
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1fae5",
    gap: 16,
  },
  tipIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#dcfce7",
    justifyContent: "center",
    alignItems: "center",
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#065f46",
    marginBottom: 8,
  },
  tipText: {
    fontSize: 14,
    color: "#047857",
    lineHeight: 20,
  },
  analyzingCard: {
    backgroundColor: "#f9fafb",
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
    marginVertical: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  analyzingTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginTop: 16,
    marginBottom: 8,
  },
  analyzingText: {
    fontSize: 14,
    color: "#6b7280",
    textAlign: "center",
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  permissionTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1f2937",
    marginTop: 20,
    marginBottom: 10,
  },
  permissionText: {
    fontSize: 16,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 30,
    lineHeight: 24,
  },
  primaryButton: {
    backgroundColor: "#10b981",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    elevation: 2,
    shadowColor: "#10b981",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  primaryButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: "space-between",
  },
  cameraHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
  },
  cameraTitle: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
  cameraButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  cameraCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  focusFrame: {
    width: 280,
    height: 280,
    borderWidth: 3,
    borderColor: "white",
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  focusText: {
    color: "white",
    fontSize: 16,
    textAlign: "center",
    marginTop: 20,
    maxWidth: 300,
  },
  cameraFooter: {
    alignItems: "center",
    paddingBottom: 40,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "rgba(255,255,255,0.5)",
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#10b981",
    justifyContent: "center",
    alignItems: "center",
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  analysisContainer: {
    padding: 20,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  headerLeft: {
    flex: 1,
  },
  statusIndicator: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#f59e0b",
  },
  statusTextSaved: {
    color: "#10b981",
  },
  discardButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  imageCard: {
    position: "relative",
    marginBottom: 20,
    borderRadius: 16,
    overflow: "hidden",
    elevation: 3,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  mealImage: {
    width: "100%",
    height: 250,
    backgroundColor: "#f3f4f6",
  },
  imageOverlay: {
    position: "absolute",
    top: 12,
    right: 12,
  },
  editImageButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    alignItems: "center",
  },
  mealInfoCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  mealInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  mealInfoTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 8,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#1f2937",
    backgroundColor: "#f9fafb",
  },
  textArea: {
    height: 80,
    textAlignVertical: "top",
  },
  nutritionCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  nutritionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  nutritionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
  },
  nutritionGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  nutritionItem: {
    alignItems: "center",
    flex: 1,
  },
  nutritionValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#10b981",
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: "500",
  },
  ingredientsCard: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  ingredientsHeader: {
    marginBottom: 16,
  },
  ingredientsTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1f2937",
    marginBottom: 4,
  },
  ingredientsSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  ingredientsList: {
    gap: 12,
  },
  ingredientCard: {
    backgroundColor: "#f9fafb",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  ingredientContent: {
    padding: 16,
  },
  ingredientHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1f2937",
    flex: 1,
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    justifyContent: "center",
    alignItems: "center",
  },
  ingredientNutrition: {
    flexDirection: "row",
    gap: 16,
  },
  nutritionText: {
    fontSize: 14,
    color: "#6b7280",
    fontWeight: "500",
  },
  emptyIngredients: {
    alignItems: "center",
    paddingVertical: 32,
  },
  emptyIngredientsText: {
    fontSize: 16,
    color: "#9ca3af",
    marginTop: 8,
  },
  actionButtons: {
    flexDirection: "row",
    gap: 12,
  },
  editButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
  },
  editButtonText: {
    color: "#10b981",
    fontSize: 16,
    fontWeight: "600",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modal: {
    width: "90%",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 20,
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1f2937",
  },
  modalCloseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f3f4f6",
    justifyContent: "center",
    alignItems: "center",
  },
  modalSubtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 20,
    lineHeight: 20,
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    minHeight: 120,
    marginBottom: 20,
    textAlignVertical: "top",
    backgroundColor: "#f9fafb",
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
    borderWidth: 1,
    borderColor: "#d1d5db",
  },
  modalCancelButtonText: {
    color: "#6b7280",
    fontSize: 16,
    fontWeight: "600",
  },
  modalConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#10b981",
  },
  modalConfirmButtonText: {
    color: "white",
    fontSize: 16,
    fontWeight: "600",
  },
  nutritionEditGrid: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  nutritionEditItem: {
    flex: 1,
  },
  numberInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "#f9fafb",
    textAlign: "center",
  },
});